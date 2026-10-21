/**
 * Deterministic filtering and ranking — port of ../agent/ranking.py, keep
 * the two in lockstep. Failure modes seen on real Daraz results drive it:
 *
 * 1. Accessories flooding a device search ("samsung a55" is mostly cases).
 * 2. Other models passing as the one asked for (A56 for A36, iPhone 17 for 15).
 * 3. Wrong sizes (a 25kg sack for "5kg").
 * 4. Copies and placeholder prices (four ৳2.5k "WH-1000XM5" clones around
 *    one ৳28.9k original; a "Samsung a 224g" at ৳180 among ৳20k phones).
 */

import type { Intent, Listing } from './types.ts'

const ACCESSORY_WORDS = new Set([
  'case', 'cover', 'protector', 'glass', 'tempered', 'charger', 'cable', 'strap', 'holder',
  'adapter', 'skin', 'pouch', 'sticker', 'mount', 'stand', 'lens', 'film', 'bumper',
])
const PRICE_FLOOR_RATIO = 0.3
// "good camera" is checked as "camera".
const FEATURE_FILLER = new Set(['good', 'great', 'best', 'nice', 'long', 'big', 'high', 'strong', 'fast', 'excellent', 'better', 'quality'])
export const QUANTITY_RE = /(\d+(?:\.\d+)?)\s*(kg|g|gm|gram|grams|l|ltr|litre|liter|ml|pcs|pc|pack)\b/gi
const UNIT_ALIASES: Record<string, string> = { gm: 'g', gram: 'g', grams: 'g', ltr: 'l', litre: 'l', liter: 'l', pc: 'pcs' }

export const tokens = (text: string): string[] => text.toLowerCase().match(/[a-z0-9]+/g) ?? []
const compact = (text: string) => tokens(text).join('')

/** {"5kg"} from "Miniket Rice 5 KG" — normalized so spacing/case/alias don't matter. */
export function quantities(text: string): Set<string> {
  const found = new Set<string>()
  for (const [, amount, unit] of text.matchAll(QUANTITY_RE)) {
    const u = unit.toLowerCase()
    found.add(`${parseFloat(amount)}${UNIT_ALIASES[u] ?? u}`)
  }
  return found
}

/**
 * What pins down a specific model, as compact strings the title must contain:
 * letter+digit tokens ("a36", "1000xm5"), and a bare number glued to the word
 * before it ("iphone 15" -> "iphone15"). Sizes are left to the quantity gate.
 */
function modelTokens(queryTokens: string[]): string[] {
  const found: string[] = []
  queryTokens.forEach((t, i) => {
    if (quantities(t).size) return
    if (/\d/.test(t) && /[a-z]/.test(t)) found.push(t)
    else if (/^\d+$/.test(t) && i > 0 && !/^\d+$/.test(queryTokens[i - 1])) found.push(queryTokens[i - 1] + t)
  })
  return found
}

export function parseSold(sold: string): number {
  const m = /([\d.]+)\s*([kK])?/.exec(sold ?? '')
  if (!m) return 0
  const v = parseFloat(m[1])
  return m[2] ? Math.round(v * 1000) : Math.round(v)
}

/** A 5.0 from 2 reviews shouldn't beat a 4.7 from 900. */
export const bayesianRating = (rating: number | null, reviews: number, prior = 4, weight = 10) =>
  rating === null || reviews <= 0 ? prior : (reviews * rating + weight * prior) / (reviews + weight)

const featureKeywords = (feature: string) => tokens(feature).filter((t) => !FEATURE_FILLER.has(t) && t.length > 2)

function matchFeatures(listing: Listing, mustHave: string[]): string[] {
  const haystack = [listing.name, ...listing.highlights].join(' ').toLowerCase()
  return mustHave.filter((f) => {
    const kw = featureKeywords(f)
    return kw.length > 0 && kw.every((k) => haystack.includes(k))
  })
}

function isAccessory(listing: Listing, queryTokens: string[]): boolean {
  if (queryTokens.some((t) => ACCESSORY_WORDS.has(t))) return false
  return tokens(listing.name).some((t) => ACCESSORY_WORDS.has(t))
}

/** Share of the query's words in the title (compacted, so "wh" + "1000xm5" finds "WH-1000XM5"). */
function overlap(listing: Listing, queryTokens: string[]): number {
  if (!queryTokens.length) return 0
  const nameTokens = new Set(tokens(listing.name))
  const c = compact(listing.name)
  return queryTokens.filter((t) => nameTokens.has(t) || (t.length > 2 && c.includes(t))).length / queryTokens.length
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Best listings first, plus how many were dropped as suspiciously cheap. */
export function rank(listings: Listing[], intent: Intent, limit = 6): { ranked: Listing[]; suspicious: number } {
  const queryTokens = tokens(intent.searchQuery)
  const models = modelTokens(queryTokens)
  let candidates = listings.filter((l) => l.inStock && !isAccessory(l, queryTokens))

  if (intent.mode === 'product') {
    if (models.length) candidates = candidates.filter((l) => models.every((m) => compact(l.name).includes(m)))
    const wanted = quantities(intent.searchQuery)
    if (wanted.size) {
      // A different stated size is a different product; no stated size is kept.
      candidates = candidates.filter((l) => {
        const q = quantities(l.name)
        return q.size === 0 || [...q].some((x) => wanted.has(x))
      })
    }
    if (candidates.length) {
      // Match as many query words as the best match does: keeps Jasmine rice
      // out of "miniket rice 5kg" and WF-1000XM5 earbuds out of "wh-1000xm5".
      const best = Math.max(...candidates.map((l) => overlap(l, queryTokens)))
      candidates = candidates.filter((l) => overlap(l, queryTokens) >= best - 1e-9)
    }
  }

  // Anchor on the official store's price for a named product (copies can
  // outnumber the real thing and drag a median down); median otherwise.
  const official = intent.mode === 'product' ? candidates.filter((l) => l.officialStore).map((l) => l.price) : []
  const reference = official.length ? Math.max(...official) : candidates.length >= 4 ? median(candidates.map((l) => l.price)) : null
  let suspicious = 0
  if (reference !== null) {
    const floor = reference * PRICE_FLOOR_RATIO
    suspicious = candidates.filter((l) => l.price < floor).length
    candidates = candidates.filter((l) => l.price >= floor)
  }
  if (intent.maxPrice !== null) candidates = candidates.filter((l) => l.price <= intent.maxPrice!)
  if (intent.minPrice !== null) candidates = candidates.filter((l) => l.price >= intent.minPrice!)

  for (const l of candidates) {
    const ov = overlap(l, queryTokens)
    l.matchedFeatures = matchFeatures(l, intent.mustHave)
    const trust =
      bayesianRating(l.rating, l.reviews) / 5 + Math.min(Math.log10(parseSold(l.sold) + 1) / 4, 1) * 0.5 + (l.officialStore ? 0.3 : 0)
    const features = intent.mustHave.length ? l.matchedFeatures.length / intent.mustHave.length : 0
    if (intent.mode === 'product') {
      l.relevance = Math.round((ov * 2 + trust) * 1000) / 1000
    } else {
      // A ৳25k budget means the best phone near ৳25k, not the cheapest under it.
      const budgetFit = intent.maxPrice ? l.price / intent.maxPrice : 0
      l.relevance = Math.round((features * 1.5 + trust + budgetFit * 0.8) * 1000) / 1000
    }
  }

  if (intent.mode === 'product') {
    // Same product from several sellers: best match first, then cheapest.
    candidates.sort((a, b) => Math.round(b.relevance * 10) - Math.round(a.relevance * 10) || a.price - b.price)
  } else {
    candidates.sort((a, b) => b.relevance - a.relevance || a.price - b.price)
  }
  return { ranked: candidates.slice(0, limit), suspicious }
}
