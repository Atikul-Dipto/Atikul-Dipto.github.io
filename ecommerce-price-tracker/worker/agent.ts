/**
 * The agent, as it runs on Cloudflare: one shopper request in, one answer out.
 * Port of ../agent/core.py — same steps, each timed and returned, because
 * "within a very short time" is the product's promise and has to stay
 * measurable:
 *
 *   understand  intent.buildIntent      the product name is taken as typed; only the
 *                                       "what do you need" text goes to Workers AI (~1.5s)
 *   search      daraz.search            ~0.7s, live (the name and the item type in parallel)
 *   scope       productCategory+search  only when results are mostly noise (~1s)
 *   rank        ranking.rank            deterministic
 *   remember    store.lookupHistory     the price last seen, read before this one is recorded
 *   cartup      cartup.lookup           the same product on Cartup: name index + live product pages
 *   check       eligibility.checkAll    published voucher terms, pure arithmetic
 *
 * A named product always comes back first, as named; the best choice for
 * the shopper sits beneath it (chooseBest). The summary is a template over
 * computed facts — no free-form model text.
 */

import * as cartup from './cartup.ts'
import * as daraz from './daraz.ts'
import { bestVoucher, checkAll, listingHints, money } from './eligibility.ts'
import { buildIntent, coreQuery, describeQuery, parseIntent } from './intent.ts'
import { compact, isAccessory, mainModel, namesAllOf, quantities, rank, storageOf, tokens, trusted, variantsOf } from './ranking.ts'
import * as store from './store.ts'
import type { Env, HistoryMatch, Intent, Listing, Voucher, VoucherCheck } from './types.ts'

const MIN_GOOD_RESULTS = 5
const RESULT_LIMIT = 6
// Below this, switching away from the named listing isn't worth recommending.
const MIN_SAVING_RATIO = 0.02

export const CAVEATS = [
  'Vouchers are checked against their published terms (dates, minimum spend, cap, badges). Daraz makes the final call at checkout.',
  'Store vouchers and personal vouchers (new-user, Coins) only show to a logged-in Daraz account, so they are not included.',
  'Daraz allows one platform voucher per order, so the best single voucher is shown, not a sum.',
]

export interface Result {
  listing: Listing
  history: HistoryMatch | null
  vouchers: VoucherCheck[]
  bestVoucher: VoucherCheck | null
  finalPrice: number
  hints: string[]
}

export interface BestChoice {
  // the named listing itself, the same product from another seller, something
  // else that fits better, or a description search's pick
  kind: 'exact' | 'same' | 'other_store' | 'alternative' | 'need'
  index: number // into results; alternatives for 'alternative'; cartup.results for 'other_store'
  reason: string
}

export interface Answer {
  query: string
  intent: Intent
  category: string | null
  searchUrl: string
  exactIndex: number | null // product mode: the listing that is the product they named
  bestIndex: number | null // the first result (kept for one-box clients)
  bestChoice: BestChoice | null
  summary: string
  results: Result[] // product mode: the named product, exact match first, other sellers after
  alternatives: Result[] // product mode: similar items that aren't the named product
  cartup: CartupCompare // the same product on Cartup, for comparison
  main: Result | null // the best offer to show first, from either store
  offers: Result[] // every listing of that product, both stores, cheapest first
  cartupCategories: string[] // kind-of-item searches: the Cartup categories browsed
  checkedAt: string // when these prices were read from the stores (all live, in this answer)
  seen: number
  skippedSuspicious: number
  vouchersKnown: number
  vouchersHarvestedAt: string | null
  database: 'ok' | 'unavailable' | 'not needed'
  caveats: string[]
  timingsMs: Record<string, number>
}

export interface CartupCompare {
  status: 'found' | 'not_found' | 'no_index' | 'error' | 'skipped'
  lookedUp: string | null // the title searched for: the shopper's product name, or the Daraz pick's title
  results: Result[]
  indexedAt: string | null
}

const STOP = new Set(['for', 'with', 'and', 'the', 'of', 'new', 'original', 'pcs', 'pc', 'official', 'warranty'])
const words = (s: string) => tokens(s).filter((t) => !STOP.has(t))

/**
 * Which listings (on the other store) are the same product as `title` (the shopper's product
 * name, or the Daraz pick's title). Across stores, titles are written
 * differently — Daraz's "Dahua LM27-B221B=V1 27 Inch Full HD..." is Cartup's
 * "Dahua LM27-B221B 27 Inch IPS Monitor" — so instead of every code in the
 * title, the main (longest) model code must match, with the same variant words
 * (Pro/Plus/...), the same storage and size where both state one, and heavy
 * word overlap either way (heavier still when there's no model code).
 */
export function sameProduct(listings: Listing[], title: string): Listing[] {
  const main = mainModel(title)
  const t = new Set(words(title))
  const [variants, storage, size] = [variantsOf(title, main), storageOf(title), quantities(title)]
  const titleTokens = tokens(title)
  return listings.filter((l) => {
    if (!l.inStock || isAccessory(l, titleTokens)) return false
    if (main && !(compact(l.name).includes(main) && namesAllOf(l.name, title))) return false
    if (variantsOf(l.name, main) !== variants) return false
    const s = storageOf(l.name)
    if (storage !== null && s !== null && s !== storage) return false
    const q = quantities(l.name)
    if (size.size && q.size && ![...q].some((x) => size.has(x))) return false
    const n = new Set(words(l.name))
    const shared = [...n].filter((w) => t.has(w)).length
    // With a model code in common, most words is enough; without one, the
    // words are the identity ("Teer Nazirshail Rice 5kg" isn't "miniket rice 5kg").
    return Math.max(shared / (t.size || 1), shared / (n.size || 1)) >= (main ? 0.6 : 0.8)
  })
}

const STORE: Record<Listing['site'], string> = { daraz: 'Daraz', cartup: 'Cartup' }

/** Why a listing counts as trusted, in the words the store itself uses. */
export function standing(l: Listing): string {
  if (l.officialStore) return 'Daraz Mall'
  if ((l.rating ?? 0) >= 4 && l.reviews >= 5) return `★ ${l.rating?.toFixed(1)} from ${l.reviews} reviews`
  return `seller rated ${l.sellerPositive}% positive`
}

/**
 * The same product on Cartup, if it's meaningfully cheaper (by MIN_SAVING_RATIO)
 * from a seller worth trusting, with the same storage size — the same rules
 * as another seller on Daraz.
 */
export function cheaperElsewhere(here: Result, elsewhere: Result[]): BestChoice | null {
  let best = -1
  elsewhere.forEach((r, i) => {
    if (!trusted(r.listing) || r.finalPrice > here.finalPrice * (1 - MIN_SAVING_RATIO)) return
    const [a, b] = [storageOf(here.listing.name), storageOf(r.listing.name)]
    if (a !== null && b !== null && a !== b) return
    if (best < 0 || r.finalPrice < elsewhere[best].finalPrice) best = i
  })
  if (best < 0) return null
  const [there, herePlace] = [STORE[elsewhere[best].listing.site], STORE[here.listing.site]]
  return { kind: 'other_store', index: best, reason: `Same product on ${there}, ${money(here.finalPrice - elsewhere[best].finalPrice)} less than on ${herePlace} (${standing(elsewhere[best].listing)}).` }
}

const hasWishes = (intent: Intent) => intent.mustHave.length > 0 || intent.maxPrice !== null || intent.minPrice !== null
const fitsWishes = (r: Result, intent: Intent) =>
  (intent.maxPrice === null || r.finalPrice <= intent.maxPrice) &&
  (intent.minPrice === null || r.listing.price >= intent.minPrice) &&
  intent.mustHave.every((f) => r.listing.matchedFeatures.includes(f))

/**
 * The best choice beneath the named product. If the named listing fits what
 * the shopper wants (or they said nothing), the only question is whether the
 * same product is meaningfully cheaper from a seller worth trusting. If it
 * doesn't fit (over budget, missing a wished-for feature), the best
 * alternative that does.
 */
export function chooseBest(results: Result[], alternatives: Result[], intent: Intent, elsewhere: Result[] = []): BestChoice | null {
  if (!results.length) {
    if (elsewhere.length) {
      const pick = elsewhere.findIndex((r) => trusted(r.listing))
      const l = elsewhere[Math.max(pick, 0)].listing
      return { kind: 'other_store', index: Math.max(pick, 0), reason: `Not in stock on Daraz right now; Cartup has it from ${l.seller} (${pick >= 0 ? standing(l) : 'no ratings yet'}).` }
    }
    return alternatives.length ? { kind: 'alternative', index: 0, reason: 'The closest thing on Daraz right now.' } : null
  }
  const exact = results[0]
  const misfit = hasWishes(intent) && !fitsWishes(exact, intent)
  if (misfit) {
    const fit = alternatives.findIndex((r) => fitsWishes(r, intent))
    if (fit >= 0) {
      const a = alternatives[fit]
      const why = [
        intent.maxPrice !== null ? `fits your ${money(intent.maxPrice)} budget` : '',
        a.listing.matchedFeatures.length ? `mentions ${a.listing.matchedFeatures.join(', ')}` : '',
      ].filter(Boolean)
      return { kind: 'alternative', index: fit, reason: `The one you named doesn't match what you need; this ${why.join(' and ') || 'fits what you asked for'}.` }
    }
  }
  // The best offer of the product on either store: the cheapest from a seller
  // worth trusting (8+128GB is not the same product as 8+256GB). Measured
  // against the best trusted offer on the other store — not against whichever
  // listing happened to have the closest title, which can be an odd ৳2,500 one.
  const sameSize = (r: Result) => {
    const [a, b] = [storageOf(exact.listing.name), storageOf(r.listing.name)]
    return a === null || b === null || a === b
  }
  const offers = [...results.map((r, index) => ({ r, kind: 'same' as const, index })), ...elsewhere.map((r, index) => ({ r, kind: 'other_store' as const, index }))]
  const trustedOffers = offers.filter((o) => trusted(o.r.listing) && sameSize(o.r)).sort((a, b) => a.r.finalPrice - b.r.finalPrice)
  const best = trustedOffers[0]
  const isExact = best?.kind === 'same' && best.index === 0
  // Not worth leaving a trusted named listing for a saving under MIN_SAVING_RATIO.
  const marginal = best && trusted(exact.listing) && best.r.finalPrice > exact.finalPrice * (1 - MIN_SAVING_RATIO)
  if (best && !isExact && !marginal) {
    const l = best.r.listing
    const other = trustedOffers.find((o) => o.r.listing.site !== l.site)
    const cheaperUnrated = offers.filter((o) => o.r.finalPrice < best.r.finalPrice && !trusted(o.r.listing)).length
    let reason = `The cheapest offer of it from a seller worth trusting: ${l.seller} on ${STORE[l.site]} (${standing(l)})`
    if (other) reason += `, ${money(other.r.finalPrice - best.r.finalPrice)} less than the best on ${STORE[other.r.listing.site]}`
    reason += '.'
    if (cheaperUnrated) reason += ` ${cheaperUnrated} cheaper listing${cheaperUnrated > 1 ? 's' : ''} from sellers without ratings ${cheaperUnrated > 1 ? 'are' : 'is'} in All offers.`
    return { kind: best.kind, index: best.index, reason }
  }
  if (misfit) {
    const over = intent.maxPrice !== null && exact.finalPrice > intent.maxPrice
    return {
      kind: 'exact',
      index: 0,
      reason: `${over ? `It's over your ${money(intent.maxPrice!)} budget` : "It doesn't mention everything you need"}, and nothing similar on Daraz fits better right now — so it's still the one to get.`,
    }
  }
  return {
    kind: 'exact',
    index: 0,
    reason:
      results.length > 1
        ? `The one you asked for is already the best deal: no seller worth trusting has it meaningfully cheaper on Daraz or Cartup.`
        : 'The one you asked for is the only in-stock listing of it.',
  }
}

function priceLine(r: Result): string {
  const l = r.listing
  let s = `${l.name} at ${money(l.price)} from ${l.seller}`
  if (l.originalPrice) s += ` (was ${money(l.originalPrice)}, ${l.discountPercent}% off)`
  return s
}

function voucherLine(r: Result, vouchersKnown: number): string {
  const bv = r.bestVoucher
  if (bv) {
    let line = `With the ${bv.voucher.title} (${money(bv.saving)} off) you'd pay ${money(r.finalPrice)}`
    if (bv.conditions.length) line += ` (conditions: ${bv.conditions.map((c) => c[0].toLowerCase() + c.slice(1)).join('; ')})`
    return line + '.'
  }
  return vouchersKnown ? `None of the ${vouchersKnown} public Daraz vouchers we know of applies to it.` : 'We have no current public Daraz vouchers on record.'
}

function historyLine(r: Result): string {
  const h = r.history
  if (!h) return "First time we've tracked this listing — its price is now saved for next time."
  const diff = r.listing.price - h.lastPrice
  const trend = diff === 0 ? 'same as' : diff > 0 ? 'up from' : 'down from'
  return `That's ${trend} ${money(h.lastPrice)} when we last checked (${h.lastSeen.slice(0, 10)}); lowest we've seen is ${money(h.lowestPrice)} across ${h.checks} checks.`
}

export function summarize(
  intent: Intent,
  results: Result[],
  alternatives: Result[],
  choice: BestChoice | null,
  vouchersKnown: number,
  suspicious: number,
  seen: number,
): string {
  if (intent.mode === 'need') {
    const budget = intent.maxPrice ? ` under ${money(intent.maxPrice)}` : ''
    if (!results.length) return `Nothing on Daraz matched "${intent.searchQuery}"${budget} right now.`
    const r = results[0]
    const parts = [`Best pick: ${priceLine(r)} on Daraz.`, voucherLine(r, vouchersKnown), historyLine(r)]
    const missing = intent.mustHave.filter((f) => !r.listing.matchedFeatures.includes(f))
    if (r.listing.matchedFeatures.length) parts.push(`Listing mentions: ${r.listing.matchedFeatures.join(', ')}.`)
    if (missing.length) parts.push(`Not mentioned in the listing (check specs): ${missing.join(', ')}.`)
    return parts.join(' ')
  }

  const parts: string[] = []
  if (results.length) {
    parts.push(`You asked for: ${priceLine(results[0])} on Daraz.`, voucherLine(results[0], vouchersKnown), historyLine(results[0]))
  } else {
    parts.push(
      seen
        ? `Daraz has no in-stock listing of "${intent.searchQuery}" itself right now — the ${seen} results it returned were accessories, other models, or out of stock.`
        : `Nothing on Daraz matched "${intent.searchQuery}" right now.`,
    )
  }
  if (choice?.kind === 'same') parts.push(`Best choice: ${priceLine(results[choice.index])}. ${choice.reason}`)
  else if (choice?.kind === 'other_store') parts.push(choice.reason)
  else if (choice?.kind === 'alternative') parts.push(`Best choice: ${priceLine(alternatives[choice.index])}. ${choice.reason}`)
  else if (choice?.kind === 'exact') parts.push(choice.reason)
  if (suspicious) parts.push(`Skipped ${suspicious} listing${suspicious > 1 ? 's' : ''} priced far below the rest (parts, accessories, copies or placeholder prices).`)
  return parts.join(' ')
}

export interface AskInput {
  name?: string // a product name, searched exactly as typed
  details?: string // what they need: features, budget — the only text the AI reads
  query?: string // one-box clients: a name or a description, worked out by the agent
}

export async function run(input: AskInput, env: Env, now = new Date()): Promise<Answer> {
  const t0 = Date.now()
  const timings: Record<string, number> = {}
  let t = t0
  const lap = (name: string) => {
    const n = Date.now()
    timings[name] = n - t
    t = n
  }
  const nowIso = now.toISOString()
  const today = nowIso.slice(0, 10)
  const query = input.query ?? [input.name, input.details].filter(Boolean).join(' — ')

  const intent = input.query !== undefined ? await parseIntent(input.query, env) : await buildIntent(input.name ?? '', input.details ?? '', env)
  lap('understand')

  const named = intent.mode === 'product'
  // A named product is searched with no price filter — they see what they
  // named whatever it costs; the budget goes to the search for alternatives.
  const budget = { minPrice: intent.minPrice, maxPrice: intent.maxPrice }
  // Alternatives: the kind of item from the "what do you need" box when given,
  // otherwise from the name's own descriptive words.
  const altQuery = !named
    ? null
    : intent.productType && hasWishes(intent)
      ? [intent.brand, intent.productType].filter(Boolean).join(' ')
      : describeQuery(intent.searchQuery)
  // Brand + model code ("Jedel KL69"): Daraz answers the same long title with
  // 7 listings one time and 40 the next; this reliably finds every seller.
  const core = named ? coreQuery(intent.searchQuery) : null
  // A kind of item with a budget: Daraz's first page for "monitor" under ৳30k
  // is mostly ৳3–6k screens, so also look near the budget (50–100% of it).
  // And the kind plus the shopper's describing words ("formal Shirt").
  const nearBudget =
    !named && intent.maxPrice ? { minPrice: Math.max(intent.minPrice ?? 0, Math.round(intent.maxPrice * 0.5)), maxPrice: intent.maxPrice } : null
  const refined = !named ? (intent.refinedQuery ?? null) : null
  const optional = (q: string | null, opts: Parameters<typeof daraz.search>[1] = {}) => (q ? daraz.search(q, opts).catch(() => null) : Promise.resolve(null))
  // Cartup, for a named product: looked up alongside the Daraz searches.
  const cartupEarly = named ? cartup.lookup(env.PP_DB, intent.searchQuery) : null
  // ...and for a kind of item, browsed through Cartup's category pages, so both
  // stores' listings are ranked together.
  const kinds = [intent.refinedQuery, intent.productType, intent.searchQuery].filter((k): k is string => Boolean(k))
  const cartupBrowse = named ? null : cartup.browse(env.PP_DB, kinds)
  const [first, coreHits, alt, nearHits, refinedHits] = await Promise.all([
    daraz.search(intent.searchQuery, named ? {} : budget),
    optional(core),
    optional(altQuery, budget),
    optional(nearBudget ? intent.searchQuery : null, nearBudget ?? {}),
    optional(refined, budget),
  ])
  const extra = alt?.listings ?? []
  const browsed = cartupBrowse ? await cartupBrowse : null
  let pool = [...new Map([first, coreHits, nearHits, refinedHits].flatMap((r) => r?.listings ?? []).concat(browsed?.listings ?? []).map((l) => [l.itemId, l])).values()]
  // Cartup listings from category pages carry no seller or reviews, so they'd
  // never outrank anything: the best few Cartup candidates get their product
  // pages read first, then both stores are ranked together.
  if (browsed?.listings.length) {
    const topCartup = rank(browsed.listings, intent, 3).ranked
    const full = new Map((await cartup.enrich(topCartup)).map((l) => [l.itemId, l]))
    pool = pool.map((l) => full.get(l.itemId) ?? l)
  }
  let { ranked, alternatives, suspicious } = rank(pool, intent, RESULT_LIMIT, extra)
  let searchUrl = first.url
  let category: string | null = null
  lap('search')

  if (ranked.length < MIN_GOOD_RESULTS && ranked.length > 0) {
    // The best real hit's own category (its product page knows it).
    category = await daraz.productCategory(ranked[0].url).catch(() => null)
    if (category) {
      const scoped = await daraz.search(intent.searchQuery, { category, ...(named ? {} : budget) })
      // Merge, never replace: an oddly filed seed must not hide the first search's hits.
      const merged = new Map([...pool, ...scoped.listings].map((l) => [l.itemId, l]))
      const rescored = rank([...merged.values()], intent, RESULT_LIMIT, extra)
      if (rescored.ranked.length > ranked.length) {
        ranked = rescored.ranked
        alternatives = rescored.alternatives
        suspicious = rescored.suspicious
        searchUrl = scoped.url
      }
    }
    lap('scope')
  }

  // The same product on the other store. Named: Cartup, looked up already.
  // Kind of item: for the pick itself — a Daraz pick is looked up on Cartup
  // (and matched against the Cartup listings already browsed); a Cartup pick
  // is matched against the Daraz listings already found.
  const pick = ranked[0]
  const lookedUp = named ? intent.searchQuery : (pick?.name ?? null)
  const found = cartupEarly ? await cartupEarly : pick?.site === 'daraz' ? await cartup.lookup(env.PP_DB, pick.name) : null
  let onOtherStore: Listing[] = []
  if (lookedUp) {
    const candidates =
      named || pick?.site === 'daraz'
        ? [...(found?.listings ?? []), ...(browsed?.listings ?? [])]
        : pool.filter((l) => l.site === 'daraz')
    onOtherStore = [...new Map(sameProduct(candidates, lookedUp).filter((l) => l.itemId !== pick?.itemId).map((l) => [l.itemId, l])).values()]
    // Cartup offers found on category pages: read their product pages too
    // (seller, real reviews) before anything is recommended from them.
    const bare = onOtherStore.filter((l) => l.site === 'cartup' && !l.seller).slice(0, 3)
    if (bare.length) {
      const full = new Map((await cartup.enrich(bare)).map((l) => [l.itemId, l]))
      onOtherStore = onOtherStore.map((l) => full.get(l.itemId) ?? l)
    }
  }
  lap('cartup')

  const everything = [...new Map([...ranked, ...alternatives, ...onOtherStore].map((l) => [l.itemId, l])).values()]
  let history = new Map<string, HistoryMatch>()
  let vouchers: Voucher[] = []
  let harvestedAt: string | null = null
  let database: Answer['database'] = !env.PP_DB ? 'unavailable' : everything.length ? 'ok' : 'not needed'
  if (env.PP_DB) {
    try {
      ;[history, { vouchers, harvestedAt }] = await Promise.all([store.lookupHistory(env.PP_DB, everything), store.loadVouchers(env.PP_DB, today)])
      if (everything.length) await store.recordListings(env.PP_DB, everything, nowIso)
    } catch {
      database = 'unavailable' // the answer must never sink with the database
    }
  }
  lap('remember')

  const toResult = (listing: Listing): Result => {
    const checks = checkAll(vouchers, listing, today)
    const bv = bestVoucher(checks)
    return { listing, history: history.get(listing.itemId) ?? null, vouchers: checks, bestVoucher: bv, finalPrice: listing.price - (bv?.saving ?? 0), hints: listingHints(listing) }
  }
  const results = ranked.map(toResult)
  const altResults = alternatives.map(toResult)
  const otherResults = onOtherStore.map(toResult)
  const cartupResults = otherResults.filter((r) => r.listing.site === 'cartup')
  let choice: BestChoice | null = null
  if (named) choice = chooseBest(results, altResults, intent, otherResults)
  else if (results.length) {
    choice = { kind: 'need', index: 0, reason: 'Best fit for what you described across Daraz and Cartup: features, seller trust and closeness to your budget.' }
    // The pick itself, cheaper on the other store: same rule as for a named product.
    const elsewhere = cheaperElsewhere(results[0], otherResults)
    if (elsewhere) choice = elsewhere
  }
  // What to show first: the best offer, from whichever store it's on.
  const main =
    choice?.kind === 'other_store' ? otherResults[choice.index] : choice?.kind === 'same' ? results[choice.index] : (results[0] ?? otherResults[0] ?? null)
  const offers = (named ? [...results, ...otherResults] : main ? [results[0], ...otherResults].filter(Boolean) : []).sort((a, b) => a.finalPrice - b.finalPrice)
  let summary = summarize(intent, results, altResults, choice, vouchers.length, named ? suspicious : 0, first.listings.length)
  if (cartupResults.length && results.length) {
    const here = results[0].finalPrice
    const there = Math.min(...cartupResults.map((r) => r.finalPrice))
    const diff = there - here
    summary += ` On Cartup it's ${money(there)}${diff === 0 ? ', the same' : diff < 0 ? `, ${money(-diff)} less` : `, ${money(diff)} more`}.`
  } else if (found && found.status === 'not_found') {
    summary += " Cartup doesn't list it right now."
  }
  lap('check')
  timings.total = Date.now() - t0

  return {
    query,
    intent,
    category,
    searchUrl,
    exactIndex: named && results.length ? 0 : null,
    bestIndex: results.length ? 0 : null,
    bestChoice: choice,
    summary,
    results,
    alternatives: altResults,
    main,
    offers,
    cartupCategories: browsed?.categories ?? [],
    checkedAt: nowIso,
    cartup: {
      status: cartupResults.length ? 'found' : !found && !browsed ? 'skipped' : found && found.status !== 'found' ? found.status : 'not_found',
      lookedUp,
      results: cartupResults,
      indexedAt: found?.indexedAt ?? null,
    },
    seen: first.listings.length,
    skippedSuspicious: named ? suspicious : 0,
    vouchersKnown: vouchers.length,
    vouchersHarvestedAt: harvestedAt,
    database,
    caveats: CAVEATS,
    timingsMs: timings,
  }
}
