/**
 * "Is it cheaper elsewhere?" for one product a shopper is looking at: a Daraz
 * or Cartup product page (from the browser extension) or a link shared from
 * the stores' apps (to the installable web app). The answer is that product
 * on every store, with the same matching rules as the agent: other sellers,
 * other sizes, close matches, and each store's cheapest trusted offer.
 *
 * Each product's answer is cached for 6 hours, so a popular page doesn't
 * become a stream of requests to the stores (Daraz answered Cloudflare with a
 * bot check after ~50 questions in half an hour).
 */

import { closestFirst, compareAcross, matchRows, recommendHere, relations, type Result, type StoreAnswer } from './agent.ts'
import * as cartup from './cartup.ts'
import * as daraz from './daraz.ts'
import { bestVoucher, checkAll, listingHints } from './eligibility.ts'
import { coreQuery } from './intent.ts'
import * as store from './store.ts'
import type { Env, HistoryMatch, Intent, Listing, Voucher } from './types.ts'

const CACHE_SECONDS = 6 * 3600
// Raised whenever matching changes, so cached answers from the old rules are dropped.
const CACHE_VERSION = 2

export interface ProductRef {
  site: Listing['site']
  itemId: string // as the agent keys it: Daraz's item id, "cartup:<id>"
  slug: string
  url: string
}

export interface Comparison {
  source: Result // the product being looked at, as its store sells it
  stores: StoreAnswer[] // that product on each store: recommended = its cheapest trusted offer there
  cheaper: { site: Listing['site']; label: string; saving: number } | null // the same product for less elsewhere
  checkedAt: string
  cached: boolean
}

const DARAZ_PRODUCT = /daraz\.com\.bd\/products\/([^?#\s]*?)-i(\d+)(?:-s\d+)?\.html/i
const CARTUP_PRODUCT = /cartup\.com\/product\/([^?#\s/"'<>]+)/i
const ANY_URL = /https?:\/\/[^\s"'<>]+/gi

/** A Daraz or Cartup product page's address, from a URL or the text an app shares ("I found this on Daraz! https://..."). */
export function readProductUrl(text: string): ProductRef | null {
  const d = DARAZ_PRODUCT.exec(text)
  if (d) return { site: 'daraz', itemId: d[2], slug: d[1], url: `https://www.daraz.com.bd/products/${d[1]}-i${d[2]}.html` }
  const c = CARTUP_PRODUCT.exec(text)
  if (c) {
    const slug = decodeURIComponent(c[1])
    const id = /[_-](\d{9,})[_-][a-z0-9]+$/.exec(slug)?.[1] ?? slug
    return { site: 'cartup', itemId: `cartup:${id}`, slug, url: `https://www.cartup.com/product/${slug}` }
  }
  return null
}

/**
 * A short link shared from an app ("https://s.daraz.com.bd/s.ZEAe") leads to
 * the product page through redirects, or a page that names it.
 */
export async function resolveShared(text: string): Promise<ProductRef | null> {
  const direct = readProductUrl(text)
  if (direct) return direct
  let next = (text.match(ANY_URL) ?? []).find((u) => /(^|\.)(daraz\.com\.bd|cartup\.com)$/i.test(new URL(u).hostname))
  for (let hop = 0; next && hop < 4; hop++) {
    const response = await fetch(next, { redirect: 'manual', headers: { 'user-agent': UA }, signal: AbortSignal.timeout(6000) }).catch(() => null)
    if (!response) return null
    const location = response.headers.get('location')
    if (location) {
      next = new URL(location, next).toString()
      const found = readProductUrl(next)
      if (found) return found
      continue
    }
    return readProductUrl(await response.text().catch(() => ''))
  }
  return null
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

/** A Daraz address's words ("hoco-eq34-plus-rima-tws-earbuds") as a search. */
const slugWords = (slug: string) => decodeURIComponent(slug).replace(/[-_]+/g, ' ').trim()

const product = (name: string): Intent => ({ rawQuery: name, mode: 'product', searchQuery: name, productType: null, brand: null, minPrice: null, maxPrice: null, mustHave: [], source: 'typed' })

/**
 * The product on every store. `name` is what the page shows (the extension
 * reads it), a better search than the address's words; prices only ever come
 * from the stores themselves.
 */
export async function compare(ref: ProductRef, env: Env, opts: { name?: string; now?: Date } = {}): Promise<Comparison | { error: string }> {
  const cacheKey = `https://dorai.cache/compare/v${CACHE_VERSION}/${ref.site}/${encodeURIComponent(ref.itemId)}`
  const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default
  const hit = await cache?.match(cacheKey).catch(() => undefined)
  if (hit) return { ...((await hit.json()) as Comparison), cached: true }

  const now = opts.now ?? new Date()
  const nowIso = now.toISOString()
  const db = env.PP_DB
  // A shared Daraz link has no title with it: the page's own is a better search than the address's words.
  let given = opts.name?.replace(/\s+/g, ' ').trim()
  if (!given && ref.site === 'daraz') given = (await daraz.productTitle(ref.url).catch(() => null)) ?? undefined
  const name = (given || (ref.site === 'daraz' ? slugWords(ref.slug) : cartup.nameFromSlug(ref.slug))).slice(0, 200)
  const searches = [...new Set([name, coreQuery(name)].filter((q): q is string => Boolean(q)))]

  // Both stores by name and by brand + model code (a seller's long title —
  // "Hoco EQ34 Plus Rima ANC+ENC TWS Earbuds - Bluetooth 5.4 - App Supported
  // Wireless Headphones - 7H Playtime..." — finds generic earbuds on Cartup;
  // "Hoco EQ34" finds it); the Cartup page itself when that's the source.
  const [darazHits, found, own] = await Promise.all([
    Promise.all(searches.map((q) => daraz.search(q).catch(() => null))),
    Promise.all(searches.map((q) => cartup.lookup(db, q))),
    ref.site === 'cartup' ? cartup.fetchProduct(ref.slug).catch(() => null) : Promise.resolve(null),
  ])
  const unique = (ls: Listing[]) => [...new Map(ls.map((l) => [l.itemId, l])).values()]
  const darazPool = unique(darazHits.flatMap((r) => r?.listings ?? []))
  const darazDown = darazHits.every((r) => r === null)
  const cartupPool = unique([...(own ? [own] : []), ...found.flatMap((f) => f.listings)])
  const source = ref.site === 'daraz' ? darazPool.find((l) => l.itemId === ref.itemId) : own
  if (!source) {
    return {
      error:
        ref.site === 'daraz'
          ? darazDown
            ? "Couldn't reach Daraz just now — try again in a moment."
            : "Daraz's search doesn't show this product right now, so its price can't be checked."
          : "Couldn't read that Cartup product page just now.",
    }
  }

  // Price memory, vouchers, and every price seen written back, as the agent does.
  const everything = unique([source, ...darazPool, ...cartupPool])
  let history = new Map<string, HistoryMatch>()
  let vouchers: Voucher[] = []
  if (db) {
    try {
      ;[history, { vouchers }] = await Promise.all([store.lookupHistory(db, everything), store.loadVouchers(db, nowIso.slice(0, 10))])
      await store.recordListings(db, everything, nowIso)
    } catch {
      // the answer never sinks with the database
    }
  }
  const results = new Map<string, Result>()
  const toResult = (listing: Listing): Result => {
    const known = results.get(listing.itemId)
    if (known) return known
    const checks = checkAll(vouchers, listing, nowIso.slice(0, 10))
    const bv = bestVoucher(checks)
    const result = { listing, history: history.get(listing.itemId) ?? null, vouchers: checks, bestVoucher: bv, finalPrice: listing.price - (bv?.saving ?? 0), hints: listingHints(listing) }
    results.set(listing.itemId, result)
    return result
  }

  // The product on each store, matched to the source's own title.
  const intent = product(source.name)
  const relate = relations(source.name)
  const answerFor = (site: Listing['site'], label: string, pool: Listing[], link: string | null): StoreAnswer => {
    const same = pool.filter((l) => l.itemId === source.itemId || relate(l) === 'same')
    // Its own store: the source first, as the listing being looked at.
    const ordered = closestFirst(same.map(toResult), source.name).sort((a, b) => Number(b.listing === source) - Number(a.listing === source))
    const { pick, why } = recommendHere(ordered, intent)
    const rows = matchRows({ intent, title: source.name, ref: source, same: ordered.map((r) => r.listing), pool })
    const answer: StoreAnswer = {
      site,
      label,
      recommended: pick,
      why,
      matches: rows
        .filter((r) => r.listing.itemId !== pick?.listing.itemId)
        .slice(0, 8)
        .map((r) => ({ ...toResult(r.listing), relation: r.relation, label: r.label })),
      note: null,
      link,
    }
    if (!pick) answer.note = site === 'daraz' && darazDown ? "Couldn't reach Daraz just now." : `${label} doesn't list this product right now.`
    return answer
  }
  const stores = [
    answerFor('daraz', 'Daraz', darazPool, darazHits[0] ? darazHits[0].url : null),
    answerFor('cartup', 'Cartup', cartupPool, null),
  ]
  compareAcross(stores)

  const here = toResult(source)
  const elsewhere = stores
    .filter((s) => s.recommended && s.recommended.listing.itemId !== source.itemId)
    .sort((a, b) => a.recommended!.finalPrice - b.recommended!.finalPrice)[0]
  const saving = elsewhere ? here.finalPrice - elsewhere.recommended!.finalPrice : 0
  const comparison: Comparison = {
    source: here,
    stores,
    cheaper: elsewhere && saving > 0 ? { site: elsewhere.site, label: elsewhere.label, saving } : null,
    checkedAt: nowIso,
    cached: false,
  }
  await cache
    ?.put(cacheKey, new Response(JSON.stringify(comparison), { headers: { 'content-type': 'application/json', 'cache-control': `max-age=${CACHE_SECONDS}` } }))
    .catch(() => undefined)
  return comparison
}
