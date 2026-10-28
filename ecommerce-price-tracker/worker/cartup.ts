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

import { isAccessory, modelTokens, tokens } from './ranking.ts'
import type { D1Database, Listing } from './types.ts'

const MAX_PAGES = 4
const MAX_CANDIDATES = 40
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

  const hits = new Map<number, number>()
  for (const ids of postings.values()) for (const id of ids) hits.set(id, (hits.get(id) ?? 0) + 1)
  let candidates = [...hits.entries()]
  const requiredIds = required.filter((w) => postings.has(w)).map((w) => new Set(postings.get(w)))
  if (requiredIds.length) candidates = candidates.filter(([id]) => requiredIds.every((s) => s.has(id)))
  // Cases and covers flood model searches ("Samsung Galaxy A36" on Cartup is
  // mostly cases); they're dropped once names are known, before any page fetch.
  candidates.sort((a, b) => b[1] - a[1] || a[0] - b[0])
  const top = candidates.slice(0, MAX_CANDIDATES).map(([id]) => id)
  if (!top.length) return { slugs: [], meta }

  const blocks = [...new Set(top.map((id) => Math.floor(id / meta.docBlock)))]
  const docRows = await db
    .prepare(`SELECT block, data FROM cartup_docs WHERE block IN (${blocks.map(() => '?').join(',')})`)
    .bind(...blocks)
    .all<{ block: number; data: string }>()
  const byBlock = new Map(docRows.results.map((r) => [r.block, JSON.parse(r.data) as string[]]))
  const titleWords = new Set(words)
  // Re-score on the full name: share of the title's words it has, minus extra words it adds.
  const scored = top
    .map((id) => byBlock.get(Math.floor(id / meta.docBlock))?.[id % meta.docBlock])
    .filter((slug): slug is string => Boolean(slug))
    .map((slug) => {
      const name = nameFromSlug(slug)
      const nameWords = tokens(name)
      const shared = nameWords.filter((w) => titleWords.has(w)).length
      return { slug, name, score: shared / titleWords.size - 0.02 * Math.max(0, nameWords.length - shared) }
    })
    .filter((c) => c.score >= MIN_CANDIDATE_SCORE && !isAccessory({ name: c.name } as Listing, all))
    .sort((a, b) => b.score - a.score || b.slug.length - a.slug.length)
  // Cartup lists some products twice (with and without an id tail): one fetch each.
  const byName = new Map<string, string>()
  for (const c of scored) if (!byName.has(c.name)) byName.set(c.name, c.slug)
  return { slugs: [...byName.values()], meta }
}

/** One Cartup product page -> Listing, from its schema.org Product JSON-LD. */
export function parseProductPage(html: string, slug: string): Listing | null {
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    let data: Record<string, unknown>
    try {
      data = JSON.parse(m[1])
    } catch {
      continue
    }
    if (data['@type'] !== 'Product') continue
    const offers = (Array.isArray(data.offers) ? data.offers[0] : data.offers) as Record<string, unknown> | undefined
    const price = Number(offers?.price)
    if (!offers || !Number.isFinite(price) || price <= 0) return null
    const rating = data.aggregateRating as { ratingValue?: string | number; ratingCount?: number; reviewCount?: number } | undefined
    const images = data.image as string[] | string | undefined
    const id = /[_-](\d{9,})[_-][a-z0-9]+$/.exec(slug)?.[1] ?? slug
    return {
      site: 'cartup',
      itemId: `cartup:${id}`,
      name: String(data.name ?? nameFromSlug(slug)).trim(),
      url: `https://www.cartup.com/product/${slug}`,
      image: (Array.isArray(images) ? images[0] : images) ?? '',
      price,
      originalPrice: null,
      discountPercent: null,
      seller: String((offers.seller as { name?: string } | undefined)?.name ?? 'Cartup'),
      brand: String((data.brand as { name?: string } | undefined)?.name ?? ''),
      rating: rating?.ratingValue !== undefined ? Number(rating.ratingValue) : null,
      reviews: Number(rating?.ratingCount ?? rating?.reviewCount ?? 0) || 0,
      sold: '',
      inStock: String(offers.availability ?? '').endsWith('InStock'),
      location: '',
      officialStore: false,
      badges: [],
      highlights: [String(data.category ?? '')].filter(Boolean),
      relevance: 0,
      matchedFeatures: [],
    }
  }
  return null
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
