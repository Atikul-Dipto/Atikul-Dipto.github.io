/**
 * Othoba as an agent tool. Its search isn't open to agents (robots.txt
 * disallows /search?, and the page's search key is deliberately obscured),
 * so products are found in a name index built from its category pages
 * (../agent/othoba_index.py, same tables as Cartup's under othoba_*), and
 * each candidate's product page, which robots.txt allows, gives the live
 * price, stock and seller from its schema.org Product data.
 *
 * Only a handful of pages are fetched per question (MAX_PAGES), never a crawl.
 */

import { type CartupLookup, searchIndex } from './cartup.ts'
import type { D1Database, Listing } from './types.ts'

const MAX_PAGES = 4
const TIMEOUT_MS = 6000
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
export const BASE = 'https://othoba.com'

type LdOffer = { price?: string | number; availability?: string; seller?: string }
type LdProduct = { '@type'?: string; name?: string; image?: string | string[]; id?: string; brand?: string; offers?: LdOffer; custom_label_0?: string }

const num = (s: string | undefined) => (s ? Number(s.replace(/,/g, '')) : NaN)

/** One Othoba product page -> Listing, from its schema.org Product data and what the page shows. */
export function parseProductPage(html: string, slug: string): Listing | null {
  let product: LdProduct | undefined
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const data = JSON.parse(m[1]) as LdProduct
      if (data['@type'] === 'Product') product = data
    } catch {
      // not JSON: skip
    }
  }
  const price = Number(product?.offers?.price)
  if (!product || !Number.isFinite(price) || price <= 0) return null
  const old = num(/class="old-price[^"]*"[^>]*>\s*(?:৳|Tk\.?)?\s*([\d,.]+)/i.exec(html)?.[1])
  const reviews = Number(/([\d,]+)\s*review\(s\)/i.exec(html)?.[1]?.replace(/,/g, '') ?? 0)
  const width = num(/class="ratings"\s+style="width:\s*([\d.]+)%/i.exec(html)?.[1])
  const original = Number.isFinite(old) && old > price ? old : null
  const decode = (s: string) => s.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  return {
    site: 'othoba',
    itemId: `othoba:${product.id ?? slug}`,
    name: decode(String(product.name ?? slug)).replace(/\s+/g, ' ').trim(),
    url: `${BASE}/${slug}`,
    image: (Array.isArray(product.image) ? product.image[0] : product.image) ?? '',
    price,
    originalPrice: original,
    discountPercent: original ? Math.round(((original - price) / original) * 100) : null,
    seller: decode(String(product.offers?.seller ?? product.custom_label_0 ?? '')).trim(),
    brand: decode(String(product.brand ?? '')).trim(),
    rating: reviews > 0 && Number.isFinite(width) ? Math.round(width / 2) / 10 : null,
    reviews,
    sold: '',
    inStock: String(product.offers?.availability ?? '').endsWith('InStock'),
    location: '',
    officialStore: false,
    badges: [],
    highlights: [],
    relevance: 0,
    matchedFeatures: [],
  }
}

export async function fetchProduct(slug: string): Promise<Listing | null> {
  const response = await fetch(`${BASE}/${slug}`, { headers: { 'user-agent': UA, accept: 'text/html' }, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!response.ok) return null
  return parseProductPage(await response.text(), slug)
}

/** Othoba listings for a product title, with live prices from their pages. */
export async function lookup(db: D1Database | undefined, title: string): Promise<CartupLookup> {
  if (!db) return { status: 'no_index', listings: [], indexedAt: null }
  try {
    const { slugs, meta } = await searchIndex(db, title, 'othoba')
    if (!meta) return { status: 'no_index', listings: [], indexedAt: null }
    const pages = await Promise.all(slugs.slice(0, MAX_PAGES).map((s) => fetchProduct(s).catch(() => null)))
    const listings = pages.filter((l): l is Listing => l !== null)
    return { status: listings.length ? 'found' : 'not_found', listings, indexedAt: meta.built }
  } catch {
    return { status: 'error', listings: [], indexedAt: null }
  }
}
