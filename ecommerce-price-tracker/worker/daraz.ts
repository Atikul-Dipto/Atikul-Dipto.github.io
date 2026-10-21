/**
 * Daraz as an agent tool: live search through the JSON Daraz's own search
 * page loads (`/catalog/?ajax=true&q=...`). Verified 2026-10-21 from
 * Cloudflare's Dhaka edge: 200, ~0.65s, 40 listings per page.
 *
 * Per-product vouchers are NOT here — Daraz only loads them for logged-in
 * users. See ../agent/vouchers.py for where public vouchers come from.
 */

import type { Listing } from './types.ts'

const BASE = 'https://www.daraz.com.bd'
const HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  'accept-language': 'en-US,en;q=0.9',
}
const TIMEOUT_MS = 8000

export interface SearchResult {
  listings: Listing[]
  categories: { slug: string; title: string }[]
  url: string
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

const absolute = (url: string) => (url.startsWith('//') ? 'https:' + url : url.startsWith('/') ? BASE + url : url)

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw Daraz JSON
export function toListing(item: any): Listing | null {
  const price = num(item.price)
  if (price === null) return null
  let original = num(item.originalPrice)
  if (original !== null && original <= price) original = null
  const badges: string[] = (item.icons ?? []).map((i: { bizType?: string }) => i.bizType).filter(Boolean)
  return {
    site: 'daraz',
    itemId: String(item.itemId ?? item.nid ?? ''),
    name: String(item.name ?? '').trim(),
    url: absolute(String(item.itemUrl ?? '')).split('?')[0],
    image: item.image ?? '',
    price,
    originalPrice: original,
    // Computed, never parsed from item.discount ("50% Off") — same rule as the scraper.
    discountPercent: original ? Math.round(((original - price) / original) * 100) : null,
    seller: item.sellerName ?? '',
    brand: item.brandName ?? '',
    rating: num(item.ratingScore),
    reviews: Number(item.review ?? 0) || 0,
    sold: item.itemSoldCntShow ?? '',
    inStock: item.inStock !== false,
    location: item.location ?? '',
    officialStore: badges.includes('lazMall'),
    badges,
    highlights: (item.description ?? []).filter(Boolean).map((h: string) => h.replace(/\s+/g, ' ').trim()),
    relevance: 0,
    matchedFeatures: [],
  }
}

export async function search(
  query: string,
  opts: { category?: string | null; minPrice?: number | null; maxPrice?: number | null } = {},
): Promise<SearchResult> {
  const url = new URL(opts.category ? `/${opts.category}/` : '/catalog/', BASE)
  url.searchParams.set('ajax', 'true')
  url.searchParams.set('q', query)
  url.searchParams.set('page', '1')
  if (opts.minPrice != null || opts.maxPrice != null) {
    url.searchParams.set('price', `${Math.floor(opts.minPrice ?? 0)}-${opts.maxPrice != null ? Math.floor(opts.maxPrice) : ''}`)
  }
  const response = await fetch(url, { headers: { ...HEADERS, accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!response.ok) throw new Error(`Daraz search returned ${response.status}`)
  const data = (await response.json()) as {
    mods?: { listItems?: unknown[]; filter?: { filterItems?: { name: string; options?: { value: string; title?: string }[] }[] } }
  }
  const listings = (data.mods?.listItems ?? []).map(toListing).filter((l): l is Listing => l !== null)
  const categoryFilter = data.mods?.filter?.filterItems?.find((f) => f.name === 'category')
  const categories = (categoryFilter?.options ?? []).filter((o) => o.value).map((o) => ({ slug: o.value, title: o.title ?? o.value }))
  return { listings, categories, url: url.toString().replace('ajax=true&', '') }
}

/**
 * Leaf category slug of one product ("smartphones"), from the product
 * page's embedded `product.brand.suggestionUrl` ("/<category>/<brand>/").
 * Read with a targeted regex rather than JSON.parse of the ~250KB page —
 * the free plan allows ~10ms CPU per request. The search JSON's own
 * category filter can't be used: it lists ~8 options and routinely omits
 * the main one ("samsung galaxy a36" offers only "Mobile Phone Cases").
 */
export async function productCategory(productUrl: string): Promise<string | null> {
  const response = await fetch(productUrl, { headers: { ...HEADERS, accept: 'text/html' }, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!response.ok) return null
  const html = await response.text()
  const match = /"suggestionUrl"\s*:\s*"https?:\/\/[^/"]+\/([a-z0-9-]+)\//.exec(html)
  return match ? match[1] : null
}
