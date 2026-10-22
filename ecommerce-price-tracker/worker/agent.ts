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
 *   check       eligibility.checkAll    published voucher terms, pure arithmetic
 *
 * A named product always comes back first, as named; the best choice for
 * the shopper sits beneath it (chooseBest). The summary is a template over
 * computed facts — no free-form model text.
 */

import * as daraz from './daraz.ts'
import { bestVoucher, checkAll, listingHints, money } from './eligibility.ts'
import { buildIntent, coreQuery, describeQuery, parseIntent } from './intent.ts'
import { rank, trusted } from './ranking.ts'
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
  kind: 'exact' | 'same' | 'alternative' | 'need'
  index: number // into results, or into alternatives when kind is 'alternative'
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
  seen: number
  skippedSuspicious: number
  vouchersKnown: number
  vouchersHarvestedAt: string | null
  database: 'ok' | 'unavailable' | 'not needed'
  caveats: string[]
  timingsMs: Record<string, number>
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
export function chooseBest(results: Result[], alternatives: Result[], intent: Intent): BestChoice | null {
  if (!results.length) {
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
  let cheaper = -1
  results.forEach((r, i) => {
    if (i === 0 || !trusted(r.listing) || r.finalPrice > exact.finalPrice * (1 - MIN_SAVING_RATIO)) return
    if (cheaper < 0 || r.finalPrice < results[cheaper].finalPrice) cheaper = i
  })
  if (cheaper > 0) {
    const l = results[cheaper].listing
    const standing = l.officialStore ? 'Daraz Mall' : `★ ${l.rating?.toFixed(1)} from ${l.reviews} reviews`
    return { kind: 'same', index: cheaper, reason: `Same product, ${money(exact.finalPrice - results[cheaper].finalPrice)} less from ${l.seller} (${standing}).` }
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
        ? `The one you asked for is already the best deal: no seller worth trusting has it meaningfully cheaper among ${results.length} in-stock listings.`
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
  const [first, coreHits, alt] = await Promise.all([
    daraz.search(intent.searchQuery, named ? {} : budget),
    core ? daraz.search(core).catch(() => null) : Promise.resolve(null),
    altQuery ? daraz.search(altQuery, budget).catch(() => null) : Promise.resolve(null),
  ])
  const extra = alt?.listings ?? []
  const pool = coreHits ? [...new Map([...first.listings, ...coreHits.listings].map((l) => [l.itemId, l])).values()] : first.listings
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

  const everything = [...ranked, ...alternatives]
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
  let choice: BestChoice | null = null
  if (named) choice = chooseBest(results, altResults, intent)
  else if (results.length) choice = { kind: 'need', index: 0, reason: 'Best fit for what you described: features, seller trust and closeness to your budget.' }
  const summary = summarize(intent, results, altResults, choice, vouchers.length, named ? suspicious : 0, first.listings.length)
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
    seen: first.listings.length,
    skippedSuspicious: named ? suspicious : 0,
    vouchersKnown: vouchers.length,
    vouchersHarvestedAt: harvestedAt,
    database,
    caveats: CAVEATS,
    timingsMs: timings,
  }
}
