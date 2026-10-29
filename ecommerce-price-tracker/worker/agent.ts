/**
 * The agent, as it runs on Cloudflare: one shopper request in, one answer out.
 * Port of ../agent/core.py — same steps, each timed and returned, because
 * "within a very short time" is the product's promise and has to stay
 * measurable:
 *
 *   understand  intent.buildIntent      the product name is taken as typed; only the
 *                                       "what do you need" text goes to Workers AI (~1.5s)
 *   search      daraz.search            ~0.7s, live (the name and the item type in parallel)
 *               cartup.lookup/browse    alongside: its name index + product pages, or its category pages
 *   scope       productCategory+search  only when Daraz's results are mostly noise (~1s)
 *   cartup      cartup.enrich           product pages for the Cartup listings about to be shown
 *   remember    store.lookupHistory     the price last seen, read before this one is recorded
 *   check       eligibility.checkAll    published voucher terms, pure arithmetic
 *
 * Every store gets its own answer (StoreAnswer): its recommended option and
 * why, then its matches. No store's pick is pushed over another's — where
 * both have the same product, each says how its price compares.
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
const MATCH_LIMIT = 8
// Below this, leaving the closest-named trusted listing for a cheaper one isn't worth it.
const MIN_SAVING_RATIO = 0.02

export const CAVEATS = [
  'Vouchers are checked against their published terms (dates, minimum spend, cap, badges). Daraz makes the final call at checkout.',
  'Store vouchers and personal vouchers (new-user, Coins) only show to a logged-in Daraz account, so they are not included.',
  'Daraz allows one platform voucher per order, so the best single voucher is shown, not a sum.',
  "Cartup prices and stock are read live from its product pages. Reviews and seller ratings are the ones those pages show; Cartup's hidden search-engine ratings (every product “4.6–5.0 from ~1,300 ratings”) aren't real reviews and are ignored.",
]

export interface Result {
  listing: Listing
  history: HistoryMatch | null
  vouchers: VoucherCheck[]
  bestVoucher: VoucherCheck | null
  finalPrice: number
  hints: string[]
}

export interface StoreMatch extends Result {
  relation: 'same' | 'similar' // the product asked for (another seller), or something like it
}

/** One store's part of the answer. More stores add more of these. */
export interface StoreAnswer {
  site: Listing['site']
  label: string
  recommended: Result | null
  why: string | null
  matches: StoreMatch[]
  note: string | null // why a store has nothing, or what it couldn't do
  link: string | null // the store's own results for this search, when there is one
}

export interface Answer {
  query: string
  intent: Intent
  stores: StoreAnswer[]
  summary: string
  checkedAt: string // when these prices were read from the stores (all live, in this answer)
  cartupCategories: string[] // the Cartup category pages browsed
  seen: number // listings Daraz's first search returned
  skippedSuspicious: number
  vouchersKnown: number
  vouchersHarvestedAt: string | null
  database: 'ok' | 'unavailable' | 'not needed'
  caveats: string[]
  timingsMs: Record<string, number>
}

const STORE: Record<Listing['site'], string> = { daraz: 'Daraz', cartup: 'Cartup' }
const STOP = new Set(['for', 'with', 'and', 'the', 'of', 'new', 'original', 'pcs', 'pc', 'official', 'warranty'])
const words = (s: string) => tokens(s).filter((t) => !STOP.has(t))

/**
 * Which listings are the same product as `title` (the shopper's product name,
 * or another store's pick). Across stores, titles are written differently —
 * Daraz's "Dahua LM27-B221B=V1 27 Inch Full HD..." is Cartup's "Dahua
 * LM27-B221B 27 Inch IPS Monitor" — so instead of every code in the title,
 * the main (longest) model code must match, with the same variant words
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

/** Closest title to `name` first (share of its words), then cheapest. */
function closestFirst(results: Result[], name: string): Result[] {
  const want = new Set(words(name))
  const score = (r: Result) => words(r.listing.name).filter((w) => want.has(w)).length / (want.size || 1)
  return [...results].sort((a, b) => score(b) - score(a) || a.finalPrice - b.finalPrice)
}

/** Why a listing counts as trusted, in the words the store itself uses. */
export function standing(l: Listing): string {
  if (l.officialStore) return 'Daraz Mall'
  if ((l.rating ?? 0) >= 4 && l.reviews >= 5) return `★ ${l.rating?.toFixed(1)} from ${l.reviews} reviews`
  if (l.sellerPositive) return `seller rated ${l.sellerPositive}% positive`
  return 'no ratings yet'
}

const sameSize = (a: Result, b: Result) => {
  const [x, y] = [storageOf(a.listing.name), storageOf(b.listing.name)]
  return x === null || y === null || x === y
}

/**
 * One store's recommendation for a named product, from its listings of that
 * product (closest title first): the cheapest from a seller worth trusting —
 * unless that's barely cheaper than a trusted closest match — or, with no
 * trusted seller, the closest match, said plainly.
 */
export function recommendHere(same: Result[], intent: Intent): { pick: Result | null; why: string | null } {
  if (!same.length) return { pick: null, why: null }
  const exact = same[0]
  const best = same.filter((r) => trusted(r.listing) && sameSize(r, exact)).sort((a, b) => a.finalPrice - b.finalPrice)[0]
  let pick = exact
  let why: string
  if (best && best !== exact && !(trusted(exact.listing) && best.finalPrice > exact.finalPrice * (1 - MIN_SAVING_RATIO))) {
    pick = best
    why = `The cheapest offer of it here from a seller worth trusting (${standing(best.listing)}).`
    const unrated = same.filter((r) => r.finalPrice < best.finalPrice && !trusted(r.listing)).length
    if (unrated) why += ` ${unrated} cheaper listing${unrated > 1 ? 's' : ''} from sellers without ratings ${unrated > 1 ? 'are' : 'is'} below.`
  } else if (trusted(exact.listing)) {
    why =
      same.length > 1
        ? `Closest match to the name, from a seller worth trusting (${standing(exact.listing)}); no one here has it meaningfully cheaper.`
        : `The only listing of it here (${standing(exact.listing)}).`
  } else {
    why = `Closest match to the name. Its seller has no ratings yet, so check before buying.`
  }
  if (intent.maxPrice !== null && pick.finalPrice > intent.maxPrice) why += ` It's over your ${money(intent.maxPrice)} budget — similar items below may fit.`
  return { pick, why }
}

/** What a listing actually has to go on, whether or not it clears the trust bar ("★ 5.0 from 2 reviews" is not "no ratings"). */
export function evidence(l: Listing): string {
  if (l.officialStore) return 'Daraz Mall'
  if (l.rating && l.reviews) return `★ ${l.rating.toFixed(1)} from ${l.reviews} review${l.reviews > 1 ? 's' : ''}`
  if (l.sellerPositive) return `seller rated ${l.sellerPositive}% positive`
  return 'no ratings yet'
}

/** For a kind of item: what made a store's top listing its best fit. */
function needWhy(pick: Result, intent: Intent): string {
  const parts = ['Best fit here for what you described']
  if (pick.listing.matchedFeatures.length) parts.push(`mentions ${pick.listing.matchedFeatures.join(', ')}`)
  parts.push(evidence(pick.listing))
  if (intent.maxPrice !== null) parts.push(`within your ${money(intent.maxPrice)} budget`)
  return parts.join(' · ') + '.'
}

/** Where two stores' picks are the same product, each says how its price compares — a fact, not a push. */
export function compareAcross(stores: StoreAnswer[]): void {
  for (const a of stores) {
    for (const b of stores) {
      if (a === b || !a.recommended || !b.recommended) continue
      if (!sameProduct([b.recommended.listing], a.recommended.listing.name).length) continue
      const diff = a.recommended.finalPrice - b.recommended.finalPrice
      const fact = diff === 0 ? `Same price as on ${b.label}.` : `${money(Math.abs(diff))} ${diff < 0 ? 'less' : 'more'} than on ${b.label}.`
      a.why = a.why ? `${a.why} ${fact}` : fact
    }
  }
}

function summarize(stores: StoreAnswer[]): string {
  return stores
    .map((s) => (s.recommended ? `${s.label}: ${s.recommended.listing.name} at ${money(s.recommended.finalPrice)} from ${s.recommended.listing.seller || s.label}.` : `${s.label}: ${s.note ?? 'nothing found.'}`))
    .join(' ')
}

/** Cartup categories for a named product's kind: its describing words, then just the noun ("RGB Mechanical Keyboard" → keyboards). */
function namedKinds(name: string): string[] {
  const d = describeQuery(name)
  if (!d) return []
  const last = d.split(' ').pop()
  return last && last !== d ? [d, last] : [d]
}

export interface AskInput {
  name?: string // a product name (or a kind of item), searched exactly as typed
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
  const db = env.PP_DB
  // A named product is searched with no price filter — they see what they
  // named whatever it costs; the budget goes to the search for alternatives.
  const budget = { minPrice: intent.minPrice, maxPrice: intent.maxPrice }
  // Daraz alternatives: the kind of item from the needs box when given,
  // otherwise from the name's own descriptive words.
  const altQuery = !named
    ? null
    : intent.productType && (intent.mustHave.length > 0 || intent.maxPrice !== null || intent.minPrice !== null)
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

  // Cartup runs alongside: the named product through its name index, and the
  // kind of item through its category pages (for a named product, its kind's
  // categories give the similar items).
  const kinds = named ? namedKinds(intent.searchQuery) : [intent.refinedQuery, intent.productType, intent.searchQuery].filter((k): k is string => Boolean(k))
  const cartupLookup = named ? cartup.lookup(db, intent.searchQuery) : Promise.resolve(null)
  const cartupBrowse = kinds.length ? cartup.browse(db, kinds) : Promise.resolve(null)
  const [first, coreHits, alt, nearHits, refinedHits] = await Promise.all([
    daraz.search(intent.searchQuery, named ? {} : budget),
    optional(core),
    optional(altQuery, budget),
    optional(nearBudget ? intent.searchQuery : null, nearBudget ?? {}),
    optional(refined, budget),
  ])
  const extra = alt?.listings ?? []
  const pool = [...new Map([first, coreHits, nearHits, refinedHits].flatMap((r) => r?.listings ?? []).map((l) => [l.itemId, l])).values()]
  let { ranked, alternatives, suspicious } = rank(pool, intent, RESULT_LIMIT, extra)
  let searchUrl = first.url
  lap('search')

  if (ranked.length < MIN_GOOD_RESULTS && ranked.length > 0) {
    // The best real hit's own category (its product page knows it).
    const category = await daraz.productCategory(ranked[0].url).catch(() => null)
    if (category) {
      const scoped = await daraz.search(intent.searchQuery, { category, ...(named ? {} : budget) })
      // Merge, never replace: an oddly filed seed must not hide the first search's hits.
      const merged = new Map([...pool, ...scoped.listings].map((l) => [l.itemId, l]))
      const rescored = rank([...merged.values()], intent, RESULT_LIMIT, extra)
      if (rescored.ranked.length > ranked.length) {
        ;({ ranked, alternatives, suspicious } = rescored)
        searchUrl = scoped.url
      }
    }
    lap('scope')
  }

  // ---- Cartup, on its own terms ----
  const [found, browsedRaw] = await Promise.all([cartupLookup, cartupBrowse])
  // Of same-named categories, keep the ones whose listings look like what Daraz found.
  const browsed = browsedRaw ? cartup.likeDaraz(browsedRaw, [...ranked, ...alternatives].slice(0, 10).map((l) => l.name), kinds) : null
  // For a kind of item, Cartup may carry Daraz's pick too: looked up by name.
  const pickLookup = !named && ranked[0] ? await cartup.lookup(db, ranked[0].name) : null
  // Cartup's listings ranked as a kind of item. For a named product's similar
  // items, its describing words count as wished-for features ("RGB",
  // "mechanical" for the KL69), so lookalikes rank above any keyboard.
  const describing = named ? (namedKinds(intent.searchQuery)[0] ?? '').split(' ').slice(0, -1).filter(Boolean) : []
  const asKind: Intent = { ...intent, mode: 'need', mustHave: [...intent.mustHave, ...describing] }
  let cartupSame: Listing[] = named && found ? sameProduct(found.listings, intent.searchQuery) : []
  let cartupPool: Listing[] = [...(browsed?.listings ?? []), ...(pickLookup && ranked[0] ? sameProduct(pickLookup.listings, ranked[0].name) : [])]
  cartupPool = [...new Map(cartupPool.filter((l) => !cartupSame.some((s) => s.itemId === l.itemId)).map((l) => [l.itemId, l])).values()]
  // Category listings carry no seller or reviews: read the product pages of
  // the ones about to be shown before they're ranked or recommended.
  const toShow = rank(cartupPool, asKind, named ? 4 : RESULT_LIMIT).ranked.filter((l) => !l.seller).slice(0, 4)
  if (toShow.length) {
    const full = new Map((await cartup.enrich(toShow)).map((l) => [l.itemId, l]))
    cartupPool = cartupPool.map((l) => full.get(l.itemId) ?? l)
  }
  const cartupRanked = rank(cartupPool, asKind, named ? 4 : RESULT_LIMIT).ranked
  lap('cartup')

  const everything = [...new Map([...ranked, ...alternatives, ...cartupSame, ...cartupRanked].map((l) => [l.itemId, l])).values()]
  let history = new Map<string, HistoryMatch>()
  let vouchers: Voucher[] = []
  let harvestedAt: string | null = null
  let database: Answer['database'] = !db ? 'unavailable' : everything.length ? 'ok' : 'not needed'
  if (db) {
    try {
      ;[history, { vouchers, harvestedAt }] = await Promise.all([store.lookupHistory(db, everything), store.loadVouchers(db, today)])
      if (everything.length) await store.recordListings(db, everything, nowIso)
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
  const tag = (relation: StoreMatch['relation']) => (r: Result): StoreMatch => ({ ...r, relation })

  // ---- one answer per store ----
  const darazResults = ranked.map(toResult)
  const darazStore: StoreAnswer = { site: 'daraz', label: 'Daraz', recommended: null, why: null, matches: [], note: null, link: searchUrl }
  if (named) {
    const { pick, why } = recommendHere(darazResults, intent)
    darazStore.recommended = pick
    darazStore.why = why
    darazStore.matches = [...darazResults.filter((r) => r !== pick).map(tag('same')), ...alternatives.map(toResult).map(tag('similar'))].slice(0, MATCH_LIMIT)
    if (!pick)
      darazStore.note = first.listings.length
        ? `No in-stock listing of “${intent.searchQuery}” itself — Daraz's ${first.listings.length} results were accessories, other models, or sold out.`
        : `Nothing on Daraz matched “${intent.searchQuery}” right now.`
  } else {
    darazStore.recommended = darazResults[0] ?? null
    darazStore.why = darazResults[0] ? needWhy(darazResults[0], intent) : null
    darazStore.matches = darazResults.slice(1).map(tag('similar'))
    if (!darazResults.length) darazStore.note = 'Nothing on Daraz matched what you described right now.'
  }

  const categories = browsed?.categories ?? []
  const cartupStore: StoreAnswer = {
    site: 'cartup',
    label: 'Cartup',
    recommended: null,
    why: null,
    matches: [],
    note: null,
    link: categories[0] ? `https://www.cartup.com/category/${categories[0]}` : null,
  }
  const cartupSimilar = cartupRanked.map(toResult)
  if (named) {
    const same = closestFirst(cartupSame.map(toResult), intent.searchQuery)
    const { pick, why } = recommendHere(same, intent)
    cartupStore.recommended = pick
    cartupStore.why = why
    cartupStore.matches = [...same.filter((r) => r !== pick).map(tag('same')), ...cartupSimilar.map(tag('similar'))].slice(0, MATCH_LIMIT)
    if (!pick) {
      const why = found?.status === 'no_index' ? "Cartup comparison isn't set up yet." : found?.status === 'error' ? "Couldn't reach Cartup just now." : "Cartup doesn't list this product right now."
      cartupStore.note = cartupSimilar.length ? `${why} Similar items on Cartup are below.` : why
    }
  } else {
    cartupStore.recommended = cartupSimilar[0] ?? null
    cartupStore.why = cartupSimilar[0] ? needWhy(cartupSimilar[0], intent) : null
    cartupStore.matches = cartupSimilar.slice(1).map(tag('similar'))
    if (!cartupSimilar.length)
      cartupStore.note = categories.length
        ? `Nothing in Cartup's ${categories.map((c) => c.replace(/_\d+$/, '').replace(/_+/g, ' ')).join(' and ')} pages fits what you described.`
        : 'Cartup has no section for this kind of item — it may not sell it.'
  }

  const stores = [darazStore, cartupStore]
  compareAcross(stores)
  const summary = summarize(stores)
  lap('check')
  timings.total = Date.now() - t0

  return {
    query,
    intent,
    stores,
    summary,
    checkedAt: nowIso,
    cartupCategories: categories,
    seen: first.listings.length,
    skippedSuspicious: named ? suspicious : 0,
    vouchersKnown: vouchers.length,
    vouchersHarvestedAt: harvestedAt,
    database,
    caveats: CAVEATS,
    timingsMs: timings,
  }
}
