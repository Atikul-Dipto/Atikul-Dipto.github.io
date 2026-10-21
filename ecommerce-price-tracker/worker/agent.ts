/**
 * The agent, as it runs on Cloudflare: one shopper request in, one answer out.
 * Port of ../agent/core.py — same steps, each timed and returned, because
 * "within a very short time" is the product's promise and has to stay
 * measurable:
 *
 *   understand  intent.parseIntent      Workers AI (~1.5s), rule fallback
 *   search      daraz.search            ~0.7s, live
 *   scope       productCategory+search  only when results are mostly noise (~1s)
 *   rank        ranking.rank            deterministic
 *   remember    store.lookupHistory     the price last seen, read before this one is recorded
 *   check       eligibility.checkAll    published voucher terms, pure arithmetic
 *
 * The summary is a template over computed facts — no free-form model text.
 */

import * as daraz from './daraz.ts'
import { bestVoucher, checkAll, listingHints, money } from './eligibility.ts'
import { parseIntent } from './intent.ts'
import { rank } from './ranking.ts'
import * as store from './store.ts'
import type { Env, HistoryMatch, Intent, Listing, Voucher, VoucherCheck } from './types.ts'

const MIN_GOOD_RESULTS = 5
const RESULT_LIMIT = 6

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

export interface Answer {
  query: string
  intent: Intent
  category: string | null
  searchUrl: string
  bestIndex: number | null
  summary: string
  results: Result[]
  seen: number
  skippedSuspicious: number
  vouchersKnown: number
  vouchersHarvestedAt: string | null
  database: 'ok' | 'unavailable' | 'not needed'
  caveats: string[]
  timingsMs: Record<string, number>
}

function bestIndex(results: Result[], intent: Intent): number | null {
  if (!results.length) return null
  if (intent.mode === 'need') return 0 // ranking already weighed fit, trust and features
  // Named product: among listings as relevant as the top one, lowest price after voucher wins.
  const top = results[0].listing.relevance
  let best = 0
  results.forEach((r, i) => {
    if (r.listing.relevance >= top - 0.15 && r.finalPrice < results[best].finalPrice) best = i
  })
  return best
}

export function summarize(intent: Intent, results: Result[], best: number | null, vouchersKnown: number, suspicious: number, seen: number): string {
  const budget = intent.maxPrice ? ` under ${money(intent.maxPrice)}` : ''
  if (best === null) {
    return seen
      ? `Daraz has no in-stock listing of "${intent.searchQuery}" itself${budget} right now — the ${seen} results it returned were accessories, other models, or out of stock.`
      : `Nothing on Daraz matched "${intent.searchQuery}"${budget} right now.`
  }
  const r = results[best]
  const l = r.listing
  const parts: string[] = []
  let head = `Best deal: ${l.name} at ${money(l.price)} from ${l.seller} on Daraz`
  if (l.originalPrice) head += ` (was ${money(l.originalPrice)}, ${l.discountPercent}% off)`
  parts.push(head + '.')

  const bv = r.bestVoucher
  if (bv) {
    let line = `With the ${bv.voucher.title} (${money(bv.saving)} off) you'd pay ${money(r.finalPrice)}`
    if (bv.conditions.length) line += ` (conditions: ${bv.conditions.map((c) => c[0].toLowerCase() + c.slice(1)).join('; ')})`
    parts.push(line + '.')
  } else if (vouchersKnown) {
    parts.push(`None of the ${vouchersKnown} public Daraz vouchers we know of applies to this item.`)
  } else {
    parts.push('We have no current public Daraz vouchers on record.')
  }

  const h = r.history
  if (h) {
    const diff = l.price - h.lastPrice
    const trend = diff === 0 ? 'same as' : diff > 0 ? 'up from' : 'down from'
    parts.push(`That's ${trend} ${money(h.lastPrice)} when we last checked (${h.lastSeen.slice(0, 10)}); lowest we've seen is ${money(h.lowestPrice)} across ${h.checks} checks.`)
  } else {
    parts.push("First time we've tracked this listing — its price is now saved for next time.")
  }
  if (intent.mode === 'product' && results.length > 1) {
    const prices = results.map((x) => x.listing.price)
    parts.push(`${results.length} matching listings, from ${money(Math.min(...prices))} to ${money(Math.max(...prices))}.`)
  }
  // Only for a named product: in "need" mode the dropped listings are just far
  // cheaper items of the same kind (feature phones under a smartphone budget).
  if (suspicious && intent.mode === 'product') parts.push(`Skipped ${suspicious} listing${suspicious > 1 ? 's' : ''} priced far below the rest (parts, accessories, copies or placeholder prices).`)
  if (intent.mustHave.length) {
    const missing = intent.mustHave.filter((f) => !l.matchedFeatures.includes(f))
    if (l.matchedFeatures.length) parts.push(`Listing mentions: ${l.matchedFeatures.join(', ')}.`)
    if (missing.length) parts.push(`Not mentioned in the listing (check specs): ${missing.join(', ')}.`)
  }
  return parts.join(' ')
}

export async function run(query: string, env: Env, now = new Date()): Promise<Answer> {
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

  const intent = await parseIntent(query, env)
  lap('understand')

  const first = await daraz.search(intent.searchQuery, { minPrice: intent.minPrice, maxPrice: intent.maxPrice })
  let { ranked, suspicious } = rank(first.listings, intent, RESULT_LIMIT)
  let searchUrl = first.url
  let category: string | null = null
  lap('search')

  if (ranked.length < MIN_GOOD_RESULTS && ranked.length > 0) {
    // The best real hit's own category (its product page knows it).
    category = await daraz.productCategory(ranked[0].url).catch(() => null)
    if (category) {
      const scoped = await daraz.search(intent.searchQuery, { category, minPrice: intent.minPrice, maxPrice: intent.maxPrice })
      // Merge, never replace: an oddly filed seed must not hide the first search's hits.
      const merged = new Map([...first.listings, ...scoped.listings].map((l) => [l.itemId, l]))
      const rescored = rank([...merged.values()], intent, RESULT_LIMIT)
      if (rescored.ranked.length > ranked.length) {
        ranked = rescored.ranked
        suspicious = rescored.suspicious
        searchUrl = scoped.url
      }
    }
    lap('scope')
  }

  let history = new Map<string, HistoryMatch>()
  let vouchers: Voucher[] = []
  let harvestedAt: string | null = null
  let database: Answer['database'] = !env.PP_DB ? 'unavailable' : ranked.length ? 'ok' : 'not needed'
  if (env.PP_DB) {
    try {
      ;[history, { vouchers, harvestedAt }] = await Promise.all([store.lookupHistory(env.PP_DB, ranked), store.loadVouchers(env.PP_DB, today)])
      if (ranked.length) await store.recordListings(env.PP_DB, ranked, nowIso)
    } catch {
      database = 'unavailable' // the answer must never sink with the database
    }
  }
  lap('remember')

  const results: Result[] = ranked.map((listing) => {
    const checks = checkAll(vouchers, listing, today)
    const bv = bestVoucher(checks)
    return { listing, history: history.get(listing.itemId) ?? null, vouchers: checks, bestVoucher: bv, finalPrice: listing.price - (bv?.saving ?? 0), hints: listingHints(listing) }
  })
  const best = bestIndex(results, intent)
  const summary = summarize(intent, results, best, vouchers.length, suspicious, first.listings.length)
  lap('check')
  timings.total = Date.now() - t0

  return {
    query,
    intent,
    category,
    searchUrl,
    bestIndex: best,
    summary,
    results,
    seen: first.listings.length,
    skippedSuspicious: intent.mode === 'product' ? suspicious : 0,
    vouchersKnown: vouchers.length,
    vouchersHarvestedAt: harvestedAt,
    database,
    caveats: CAVEATS,
    timingsMs: timings,
  }
}
