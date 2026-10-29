/**
 * Cartup as a second store for comparison.
 *
 * Finding: Cartup's own search API needs a per-request signature its page
 * script computes from a hidden key, and robots.txt disallows /search — so
 * the agent doesn't use either. Instead:
 *   1. a name index built from Cartup's published product sitemap
 *      (../agent/cartup_index.py, ~890k products, rebuilt weekly into D1), and
 *   2. the product pages themselves (allowed by robots.txt), which carry
 *      schema.org Product JSON-LD: live price, stock, seller, rating.
 * Verified 2026-10-28 from Cloudflare's Dhaka edge: 200 in ~110ms.
 *
 * Only a handful of pages are fetched per question (MAX_PAGES), never a crawl.
 */

import { compact, foundWords, isAccessory, modelTokens, tokens } from './ranking.ts'
import type { D1Database, Listing } from './types.ts'

const MAX_PAGES = 4
const MAX_CANDIDATES = 40
// Extra candidates holding the title's rarest word (see searchIndex).
const RARE_CANDIDATES = 20
// A browsed category's listings must share this many words (on average) with what Daraz found.
const MIN_LIKENESS = 0.3
const TIMEOUT_MS = 6000
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
// Words that don't identify a product, on top of the index's own too-common list.
const QUERY_STOPWORDS = new Set(['for', 'with', 'and', 'the', 'of', 'new', 'original', 'best', 'pcs', 'pc'])

interface Meta {
  built: string
  docs: number
  docBlock: number
  shards: number
  common: string[]
}

export interface CartupLookup {
  status: 'found' | 'not_found' | 'no_index' | 'error'
  listings: Listing[]
  indexedAt: string | null
}

export function fnv1a(token: string): number {
  let h = 0x811c9dc5
  for (const byte of new TextEncoder().encode(token)) {
    h ^= byte
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/** "c,3,p" -> [12, 15, 40]: sorted doc ids stored as base36 gaps. */
export function decodeIds(encoded: string): number[] {
  const ids: number[] = []
  let prev = 0
  for (const gap of encoded.split(',')) {
    prev += parseInt(gap, 36)
    ids.push(prev)
  }
  return ids
}

// Cartup writes slugs both ways: "jedel_kl69_..._1782881018459_m99965" and
// "dahua-lm27-b221bv1-27-inch-...-1790653663537-wid3", and sometimes no id tail.
const SLUG_TAIL_RE = /[_-]\d{9,}[_-][a-z0-9]+$/
const nameFromSlug = (slug: string) => slug.toLowerCase().replace(SLUG_TAIL_RE, '').replace(/[_-]+/g, ' ')
// Re-scored candidates below this share of the title's words aren't worth a page fetch.
const MIN_CANDIDATE_SCORE = 0.4

/**
 * Each model code in the title as the index words that make it up, longest
 * (most specific) first: "kl69" -> ["kl69"]; "WH-1000XM5" -> ["wh", "1000xm5"],
 * since the index stores single words.
 */
export function modelParts(queryTokens: string[]): string[][] {
  return modelTokens(queryTokens)
    .sort((a, b) => b.length - a.length)
    .map((m) => {
      if (queryTokens.includes(m)) return [m]
      for (let i = 1; i < queryTokens.length; i++) if (queryTokens[i - 1] + queryTokens[i] === m) return [queryTokens[i - 1], queryTokens[i]]
      return [m]
    })
}

/** The words a Cartup listing must contain: the parts of the main model code. */
export function requiredWords(queryTokens: string[]): string[] {
  return modelParts(queryTokens)[0] ?? []
}

let metaCache: { meta: Meta | null; at: number } | null = null

async function loadMeta(db: D1Database): Promise<Meta | null> {
  if (metaCache && Date.now() - metaCache.at < 10 * 60_000) return metaCache.meta
  const row = await db.prepare(`SELECT value FROM cartup_meta WHERE key = 'index'`).first<{ value: string }>().catch(() => null)
  const meta = row ? (JSON.parse(row.value) as Meta) : null
  metaCache = { meta, at: Date.now() }
  return meta
}

/** Candidate product slugs for a title, best word-overlap first. */
export async function searchIndex(db: D1Database, title: string): Promise<{ slugs: string[]; meta: Meta | null }> {
  const meta = await loadMeta(db)
  if (!meta) return { slugs: [], meta }
  const common = new Set(meta.common)
  const all = [...new Set(tokens(title))]
  const words = all.filter((t) => !QUERY_STOPWORDS.has(t) && !common.has(t))
  const codes = modelParts(all)
  if (!words.length) return { slugs: [], meta }

  const shards = [...new Set(words.map((w) => fnv1a(w) % meta.shards))]
  const { results } = await db
    .prepare(`SELECT data FROM cartup_postings WHERE shard IN (${shards.map(() => '?').join(',')})`)
    .bind(...shards)
    .all<{ data: string }>()
  const postings = new Map<string, number[]>()
  for (const row of results) {
    const data = JSON.parse(row.data) as Record<string, string>
    for (const w of words) if (data[w] !== undefined) postings.set(w, decodeIds(data[w]))
  }
  // The most specific model code Cartup's names contain as words. Cartup glues
  // codes differently ("LM27-B221B=V1" is its "lm27-b221bv1"), so a code it
  // doesn't have as a word falls back to the next one; none at all means it
  // doesn't list the product.
  const required = codes.find((parts) => parts.every((w) => postings.has(w))) ?? []
  if (codes.length && !required.length) return { slugs: [], meta }

  // A rare word says more than a common one: "jordan" picks out a bag,
  // "bag" picks out nothing. Words the index lacks weigh as much as an average one.
  const weight = new Map([...postings].map(([w, ids]) => [w, Math.log(meta.docs / ids.length)]))
  const usual = [...weight.values()].reduce((a, b) => a + b, 0) / (weight.size || 1)
  const weightOf = (w: string) => weight.get(w) ?? usual
  const hits = new Map<number, number>()
  for (const [w, ids] of postings) for (const id of ids) hits.set(id, (hits.get(id) ?? 0) + weightOf(w))
  let candidates = [...hits.entries()]
  const requiredIds = required.filter((w) => postings.has(w)).map((w) => new Set(postings.get(w)))
  if (requiredIds.length) candidates = candidates.filter(([id]) => requiredIds.every((s) => s.has(id)))
  // Cases and covers flood model searches ("Samsung Galaxy A36" on Cartup is
  // mostly cases); they're dropped once names are known, before any page fetch.
  candidates.sort((a, b) => b[1] - a[1] || a[0] - b[0])
  // Generic listings stuffed with the title's common words ("waterproof
  // crossbody chest waist bag") can outnumber the product itself, so the ones
  // holding its rarest word (usually the brand or line) always get a look.
  const rarest = [...postings.entries()].sort((a, b) => a[1].length - b[1].length)[0]
  const rare = new Set(rarest?.[1] ?? [])
  const top = [...new Set([...candidates.slice(0, MAX_CANDIDATES), ...candidates.filter(([id]) => rare.has(id)).slice(0, RARE_CANDIDATES)].map(([id]) => id))]
  if (!top.length) return { slugs: [], meta }

  const blocks = [...new Set(top.map((id) => Math.floor(id / meta.docBlock)))]
  const docRows = await db
    .prepare(`SELECT block, data FROM cartup_docs WHERE block IN (${blocks.map(() => '?').join(',')})`)
    .bind(...blocks)
    .all<{ block: number; data: string }>()
  const byBlock = new Map(docRows.results.map((r) => [r.block, JSON.parse(r.data) as string[]]))
  const total = words.reduce((sum, w) => sum + weightOf(w), 0)
  // Re-score on the full name: the weighted share of the title's words it has
  // (each counted once, however often a seller repeats it), minus extra words it adds.
  const scored = top
    .map((id) => byBlock.get(Math.floor(id / meta.docBlock))?.[id % meta.docBlock])
    .filter((slug): slug is string => Boolean(slug))
    .map((slug) => {
      const name = nameFromSlug(slug)
      const found = foundWords(words, name)
      const extra = new Set(tokens(name)).size - found.length
      return { slug, name, score: found.reduce((sum, w) => sum + weightOf(w), 0) / total - 0.02 * Math.max(0, extra) }
    })
    .filter((c) => c.score >= MIN_CANDIDATE_SCORE && !isAccessory({ name: c.name } as Listing, all))
    .sort((a, b) => b.score - a.score || b.slug.length - a.slug.length)
  // Cartup lists some products twice (with and without an id tail): one fetch each.
  const byName = new Map<string, string>()
  for (const c of scored) if (!byName.has(c.name)) byName.set(c.name, c.slug)
  return { slugs: [...byName.values()], meta }
}

/**
 * What a shopper actually sees on a Cartup product page, from its text:
 * "0.0 ( 0 reviews) 19 % ৳19,350 ৳15,591" and "93 % positive seller rating".
 *
 * Not the page's schema.org aggregateRating: checked 2026-10-29, every product
 * claims 4.6–5.0 from ~1,000–1,500 ratings there (a chair wheel "4.9 from
 * 1,375") while the page itself shows "0 reviews". Those numbers are not
 * buyer reviews and are never used.
 */
export function visibleFacts(html: string): { rating: number | null; reviews: number; originalPrice: number | null; sellerPositive: number | null } {
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  const r = /(\d(?:\.\d)?)\s*\(\s*(\d+)\s*reviews?\s*\)(?:\s*(\d+)\s*%\s*৳\s*([\d,]+)\s*৳\s*([\d,]+))?/.exec(text)
  const seller = /(\d{1,3})\s*%\s*positive seller rating/i.exec(text)
  const reviews = r ? Number(r[2]) : 0
  return {
    rating: reviews > 0 ? Number(r![1]) : null,
    reviews,
    originalPrice: r?.[4] ? Number(r[4].replace(/,/g, '')) : null,
    sellerPositive: seller ? Number(seller[1]) : null,
  }
}

type LdProduct = { name?: string; url?: string; sku?: string; image?: string[] | string; brand?: { name?: string }; category?: string; offers?: Record<string, unknown> | Record<string, unknown>[] }

function toListing(data: LdProduct, slug: string): Listing | null {
  const offers = (Array.isArray(data.offers) ? data.offers[0] : data.offers) as Record<string, unknown> | undefined
  const price = Number(offers?.price)
  if (!offers || !Number.isFinite(price) || price <= 0) return null
  const id = /[_-](\d{9,})[_-][a-z0-9]+$/.exec(slug)?.[1] ?? slug
  return {
    site: 'cartup',
    itemId: `cartup:${id}`,
    name: String(data.name ?? nameFromSlug(slug)).trim(),
    url: `https://www.cartup.com/product/${slug}`,
    image: (Array.isArray(data.image) ? data.image[0] : data.image) ?? '',
    price,
    originalPrice: null,
    discountPercent: null,
    seller: String((offers.seller as { name?: string } | undefined)?.name ?? ''),
    brand: String(data.brand?.name ?? ''),
    rating: null, // filled from the visible page (visibleFacts), never from schema.org
    reviews: 0,
    sold: '',
    inStock: String(offers.availability ?? '').endsWith('InStock'),
    location: '',
    officialStore: false,
    sellerPositive: null,
    badges: [],
    highlights: [String(data.category ?? '')].filter(Boolean),
    relevance: 0,
    matchedFeatures: [],
  }
}

function ldBlocks(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      out.push(JSON.parse(m[1]))
    } catch {
      // not JSON: skip
    }
  }
  return out
}

/** One Cartup product page -> Listing: price and stock from its schema.org data, reviews and seller from what's shown. */
export function parseProductPage(html: string, slug: string): Listing | null {
  const product = ldBlocks(html).find((d) => d['@type'] === 'Product') as LdProduct | undefined
  const listing = product ? toListing(product, slug) : null
  if (!listing) return null
  const seen = visibleFacts(html)
  listing.rating = seen.rating
  listing.reviews = seen.reviews
  listing.sellerPositive = seen.sellerPositive
  if (seen.originalPrice && seen.originalPrice > listing.price) {
    listing.originalPrice = seen.originalPrice
    listing.discountPercent = Math.round(((seen.originalPrice - listing.price) / seen.originalPrice) * 100)
  }
  // Sellers rename listings, and Cartup's search results and the page title
  // keep the old name: "Air Jordan waterproofe Crossbody Chest/Waist Bag" is
  // now headed "Jordan Luxurious Professional Waterproof Trendy Side Bag".
  // Shoppers find it by either, so both are kept.
  const title = /<meta property="og:title" content="([^"]*)"/.exec(html)?.[1]
  const earlier = title && decodeEntities(title).trim()
  if (earlier && compact(earlier) !== compact(listing.name)) listing.alsoNamed = earlier
  return listing
}

const ENTITIES: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' }
const decodeEntities = (s: string) =>
  s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) =>
    e[0] === '#' ? String.fromCodePoint(parseInt(e.slice(1).replace(/^x/i, ''), /^#x/i.test(e) ? 16 : 10)) : (ENTITIES[e.toLowerCase()] ?? m),
  )

/**
 * A category page (allowed by robots.txt) -> its first 20 products, from the
 * page's schema.org ItemList: name, price, stock. No seller or reviews there
 * (and the list's ratings are the same unreal numbers), so the agent fetches
 * the product page of any Cartup listing it's about to recommend.
 */
export function parseCategoryPage(html: string): Listing[] {
  const list = ldBlocks(html).find((d) => d['@type'] === 'ItemList') as { itemListElement?: { item?: LdProduct }[] } | undefined
  return (list?.itemListElement ?? [])
    .map((e) => e.item)
    .filter((item): item is LdProduct => Boolean(item?.url))
    .map((item) => toListing(item, String(item.url).split('/product/')[1] ?? ''))
    .filter((l): l is Listing => l !== null && l.url !== 'https://www.cartup.com/product/')
}

async function fetchProduct(slug: string): Promise<Listing | null> {
  const response = await fetch(`https://www.cartup.com/product/${slug}`, {
    headers: { 'user-agent': UA, accept: 'text/html' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!response.ok) return null
  return parseProductPage(await response.text(), slug)
}

/** Cartup listings for a product title, with live prices from their pages. */
export async function lookup(db: D1Database | undefined, title: string): Promise<CartupLookup> {
  if (!db) return { status: 'no_index', listings: [], indexedAt: null }
  try {
    const { slugs, meta } = await searchIndex(db, title)
    if (!meta) return { status: 'no_index', listings: [], indexedAt: null }
    const pages = await Promise.all(slugs.slice(0, MAX_PAGES).map((s) => fetchProduct(s).catch(() => null)))
    const listings = pages.filter((l): l is Listing => l !== null)
    return { status: listings.length ? 'found' : 'not_found', listings, indexedAt: meta.built }
  } catch {
    return { status: 'error', listings: [], indexedAt: null }
  }
}

// ---- browsing by kind of item, through category pages ----

const IRREGULAR: Record<string, string> = { mouse: 'mice', mice: 'mice' }
// A category of these is for things that go with the item, not the item.
const ACCESSORY_CATEGORY = new Set(['accessory', 'accessorie', 'lense', 'lens', 'case', 'cover', 'protector', 'battery', 'part', 'charger', 'cable', 'strap', 'holder', 'stand', 'mount', 'skin', 'bag'])

/** "monitors" -> "monitor", "glasses" -> "glass", "batteries" -> "battery", "mouse" -> "mice". */
export function stem(word: string): string {
  if (IRREGULAR[word]) return IRREGULAR[word]
  if (/(ss|ch|sh|x)es$/.test(word)) return word.slice(0, -2)
  if (/ies$/.test(word) && word.length > 4) return word.slice(0, -3) + 'y'
  if (/s$/.test(word) && !/ss$/.test(word) && word.length > 3) return word.slice(0, -1)
  return word
}

const categoryWords = (slug: string) => slug.split(/[_-]+/).filter((w) => w && !/^\d+$/.test(w)).map(stem)

/**
 * The Cartup categories for a kind of item: "detergent" -> detergent (not
 * baby_detergent), "monitor" -> monitors_449 and monitors_499 (not
 * blood_pressure_monitors), "mouse" -> mice. A category has to contain every
 * word of the kind; fewer extra words ranks higher. At most `limit`.
 */
export function pickCategories(kinds: string[], all: string[], limit = 2): string[] {
  let best: { slug: string; score: number }[] = []
  for (const kind of kinds) {
    const want = [...new Set(tokens(kind).map(stem))]
    const wantsAccessory = want.some((w) => ACCESSORY_CATEGORY.has(w))
    if (!want.length) continue
    const scored = all
      .map((slug) => {
        const have = categoryWords(slug)
        if (!want.every((w) => have.includes(w))) return null
        if (!wantsAccessory && have.some((w) => ACCESSORY_CATEGORY.has(w))) return null
        return { slug, score: want.length - 0.2 * (have.length - want.length) }
      })
      .filter((c): c is { slug: string; score: number } => c !== null)
      .sort((a, b) => b.score - a.score)
    if (scored.length && (!best.length || scored[0].score > best[0].score)) best = scored
  }
  if (!best.length) return []
  return best.filter((c) => c.score >= best[0].score - 1e-9).slice(0, limit).map((c) => c.slug)
}

let categoriesCache: { slugs: string[]; at: number } | null = null

async function loadCategories(db: D1Database): Promise<string[]> {
  if (categoriesCache && Date.now() - categoriesCache.at < 10 * 60_000) return categoriesCache.slugs
  const { results } = await db.prepare(`SELECT value FROM cartup_meta WHERE key LIKE 'categories:%'`).all<{ value: string }>()
  const slugs = results.flatMap((r) => JSON.parse(r.value) as string[])
  categoriesCache = { slugs, at: Date.now() }
  return slugs
}

/**
 * Cartup listings for a kind of item: the first page of its best-matching
 * categories, keeping only listings whose names name the kind. A category's
 * name can mislead — Cartup's "mobiles" is baby crib mobiles, its "Mobiles &
 * Tablets" page is cases and power banks (it barely sells phones).
 */
export interface Browsed {
  listings: Listing[]
  categories: string[]
  byCategory: Record<string, Listing[]>
}

export async function browse(db: D1Database | undefined, kinds: string[]): Promise<Browsed> {
  const none: Browsed = { listings: [], categories: [], byCategory: {} }
  if (!db) return none
  try {
    const categories = pickCategories(kinds, await loadCategories(db))
    const pages = await Promise.all(
      categories.map((c) =>
        fetch(`https://www.cartup.com/category/${c}`, { headers: { 'user-agent': UA, accept: 'text/html' }, signal: AbortSignal.timeout(TIMEOUT_MS) })
          .then((r) => (r.ok ? r.text() : ''))
          .catch(() => ''),
      ),
    )
    const kindWords = new Set(kinds.flatMap((k) => tokens(k).map(stem)))
    const namesKind = (l: Listing) => tokens(l.name).some((w) => kindWords.has(stem(w)))
    const byCategory: Record<string, Listing[]> = {}
    categories.forEach((c, i) => (byCategory[c] = parseCategoryPage(pages[i]).filter((l) => l.inStock && namesKind(l))))
    return { listings: [...new Map(Object.values(byCategory).flat().map((l) => [l.itemId, l])).values()], categories, byCategory }
  } catch {
    return none
  }
}

/**
 * Two Cartup categories can share a name and not a meaning: of its two
 * "monitors" categories, one is computer monitors and one is medical
 * (fetal heart-rate monitors). The listings tell them apart: keep the
 * categories whose names share the most words with what Daraz found for the
 * same search ("inch", "hz", "ips"...), dropping any far behind the best.
 */
export function likeDaraz(browsed: Browsed, darazNames: string[], kinds: string[]): Browsed {
  if (!browsed.categories.length || !darazNames.length) return browsed
  const kindWords = new Set(kinds.flatMap((k) => tokens(k).map(stem)))
  const vocabulary = new Set(darazNames.flatMap((n) => tokens(n)).filter((w) => w.length > 1 && !QUERY_STOPWORDS.has(w) && !kindWords.has(stem(w))))
  const score = (ls: Listing[]) => (ls.length ? ls.reduce((n, l) => n + tokens(l.name).filter((w) => vocabulary.has(w)).length, 0) / ls.length : 0)
  const scores = browsed.categories.map((c) => score(browsed.byCategory[c] ?? []))
  const best = Math.max(...scores)
  // Also when there's only one: nothing alike at all means it isn't this kind
  // of item ("egg_master" for the MX Master 3S), and it's left out.
  const keep = browsed.categories.filter((_, i) => scores[i] >= MIN_LIKENESS && scores[i] >= best * 0.4)
  const byCategory = Object.fromEntries(keep.map((c) => [c, browsed.byCategory[c] ?? []]))
  return { categories: keep, byCategory, listings: [...new Map(Object.values(byCategory).flat().map((l) => [l.itemId, l])).values()] }
}

/** Full product-page details (seller, real reviews, seller rating) for listings found on category pages. */
export async function enrich(listings: Listing[]): Promise<Listing[]> {
  return Promise.all(
    listings.map(async (l) => {
      const slug = l.url.split('/product/')[1]
      const full = slug ? await fetchProduct(slug).catch(() => null) : null
      return full ?? l
    }),
  )
}
