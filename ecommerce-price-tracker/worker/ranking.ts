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

// Spec values, not model names: "8gb" and "5000mah" describe a phone, "61 keys" a keyboard.
const SPEC_RE = /^\d+(?:gb|tb|mb|mah|hz|w|mp|inch|in|v|k|keys?|m|cm|mm|ft)$/
const SPEC_WORDS = new Set(['gb', 'tb', 'mb', 'mah', 'hz', 'w', 'mp', 'inch', 'key', 'keys', 'pcs', 'pc', 'months', 'month', 'years', 'year'])
const VARIANT_WORDS = new Set(['pro', 'plus', 'max', 'ultra', 'lite', 'mini', 'fe', 'neo', 'edge', 'prime'])
const GLUE_STOPWORDS =new Set(['for', 'with', 'under', 'than', 'of', 'and', 'the', 'to', 'in', 'on', 'at'])

/**
 * What pins down a specific model, as compact strings the title must contain:
 * letter+digit tokens ("kl69", "a36", "1000xm5"), and a bare number glued to
 * the plain word before it ("iphone 15" -> "iphone15"). Not sizes (the
 * quantity gate's job) or specs ("8gb", "61 keys") — those describe, they
 * don't name, and requiring them would drop sellers who word titles differently.
 */
export function modelTokens(queryTokens: string[]): string[] {
  const found: string[] = []
  queryTokens.forEach((t, i) => {
    if (quantities(t).size || SPEC_RE.test(t)) return
    if (/\d/.test(t) && /[a-z]/.test(t)) {
      // A short letter prefix is part of the code: "WH-1000XM5" -> "wh1000xm5",
      // so the WF-1000XM5 earbuds don't pass as the WH-1000XM5 headphones.
      const prev = queryTokens[i - 1]
      found.push(prev && /^[a-z]{1,3}$/.test(prev) && !GLUE_STOPWORDS.has(prev) ? prev + t : t)
      return
    }
    const prev = queryTokens[i - 1]
    if (/^\d+$/.test(t) && prev && /^[a-z]+$/.test(prev) && !GLUE_STOPWORDS.has(prev) && !SPEC_WORDS.has(queryTokens[i + 1] ?? '')) {
      found.push(prev + t)
    }
  })
  return found
}

/** A seller a shopper can reasonably buy from: Daraz Mall, or rated 4+ from at least 5 reviews. */
export const trusted = (l: Listing) => l.officialStore || ((l.rating ?? 0) >= 4 && l.reviews >= 5)

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

function trustScore(l: Listing): number {
  return bayesianRating(l.rating, l.reviews) / 5 + Math.min(Math.log10(parseSold(l.sold) + 1) / 4, 1) * 0.5 + (l.officialStore ? 0.3 : 0)
}

/** Drop listings far below a reference price; returns the survivors and how many went. */
function priceFloor(candidates: Listing[], reference: number | null): [Listing[], number] {
  if (reference === null) return [candidates, 0]
  const floor = reference * PRICE_FLOOR_RATIO
  return [candidates.filter((l) => l.price >= floor), candidates.filter((l) => l.price < floor).length]
}

/**
 * Score by fit to what the shopper asked for: wished-for features, seller
 * trust, and closeness to the budget (a ৳25k budget means the best phone
 * near ৳25k, not the cheapest thing under it).
 */
function scoreForNeed(candidates: Listing[], intent: Intent): Listing[] {
  for (const l of candidates) {
    l.matchedFeatures = matchFeatures(l, intent.mustHave)
    const features = intent.mustHave.length ? l.matchedFeatures.length / intent.mustHave.length : 0
    const budgetFit = intent.maxPrice ? l.price / intent.maxPrice : 0
    l.relevance = Math.round((features * 1.5 + trustScore(l) + budgetFit * 0.8) * 1000) / 1000
  }
  return candidates.sort((a, b) => b.relevance - a.relevance || a.price - b.price)
}

const withinBudget = (l: Listing, intent: Intent) =>
  (intent.maxPrice === null || l.price <= intent.maxPrice) && (intent.minPrice === null || l.price >= intent.minPrice)

export interface Ranked {
  ranked: Listing[] // need mode: best fit first. product mode: the named product, exact match first, then other sellers by price
  alternatives: Listing[] // product mode only: similar items that aren't the named product
  suspicious: number // dropped as priced far below the rest
}

/**
 * Rank a search. In product mode `extra` holds listings from a separate
 * search for the kind of item (from the "what do you need" box), used only
 * as alternatives.
 */
export function rank(listings: Listing[], intent: Intent, limit = 6, extra: Listing[] = []): Ranked {
  const queryTokens = tokens(intent.searchQuery)
  const candidates = listings.filter((l) => l.inStock && !isAccessory(l, queryTokens))

  if (intent.mode === 'need') {
    let pool = candidates.filter((l) => withinBudget(l, intent))
    const [kept, suspicious] = priceFloor(pool, pool.length >= 4 ? median(pool.map((l) => l.price)) : null)
    pool = scoreForNeed(kept, intent)
    return { ranked: pool.slice(0, limit), alternatives: [], suspicious }
  }

  // ---- product mode: the shopper named it ----
  const models = modelTokens(queryTokens)
  const wanted = quantities(intent.searchQuery)
  let same = candidates
  // A named model must be in the title: "kl69" never matches a KL68, "a36" never an A56.
  if (models.length) same = same.filter((l) => models.every((m) => compact(l.name).includes(m)))
  // Variant words name a different model: "Redmi Note 14" is not the Note 14
  // Pro Plus, "iPhone 15" is not the 15 Pro Max. They must match both ways.
  const variants = (ts: string[]) => ts.filter((t) => VARIANT_WORDS.has(t)).sort().join(' ')
  const wantedVariants = variants(queryTokens)
  same = same.filter((l) => variants(tokens(l.name)) === wantedVariants)
  // A different stated size is a different product; no stated size is kept.
  if (wanted.size) same = same.filter((l) => !quantities(l.name).size || [...quantities(l.name)].some((x) => wanted.has(x)))
  if (!models.length && same.length) {
    // No model code to go on, so the words are the identity: match as many
    // as the best match does (keeps Jasmine rice out of "miniket rice 5kg").
    const best = Math.max(...same.map((l) => overlap(l, queryTokens)))
    same = same.filter((l) => overlap(l, queryTokens) >= best - 1e-9)
  }

  // Anchor the floor on the official store's price when there is one: copies
  // can outnumber the real thing and drag a median down with them.
  const official = same.filter((l) => l.officialStore).map((l) => l.price)
  const [kept, suspicious] = priceFloor(same, official.length ? Math.max(...official) : same.length >= 4 ? median(same.map((l) => l.price)) : null)
  for (const l of kept) {
    l.matchedFeatures = matchFeatures(l, intent.mustHave)
    l.relevance = Math.round((overlap(l, queryTokens) * 2 + trustScore(l)) * 1000) / 1000
  }
  // Exact match first: the listing whose title matches the name most
  // closely, from the most trusted seller. Every other seller after it, cheapest first.
  const byExactness = [...kept].sort((a, b) => overlap(b, queryTokens) - overlap(a, queryTokens) || trustScore(b) - trustScore(a) || a.price - b.price)
  const exact = byExactness[0]
  const ranked = exact ? [exact, ...kept.filter((l) => l !== exact).sort((a, b) => a.price - b.price)].slice(0, limit) : []

  // Alternatives: the same kind of thing, not this model. Within the budget
  // if one was given, otherwise priced near the named product.
  const sameIds = new Set(same.map((l) => l.itemId))
  const others = new Map<string, Listing>()
  // From the name's own search, only listings that share real words with it —
  // a model-code search can drag in anything (Eid decorations for "Jedel KL69").
  // Listings from the dedicated search for the kind of item are taken as found.
  const typeWord = intent.productType ? tokens(intent.productType).at(-1) : undefined
  const related = (l: Listing) => overlap(l, queryTokens) >= 0.25 || (typeWord !== undefined && tokens(l.name).includes(typeWord))
  for (const l of [...candidates.filter(related), ...extra.filter((x) => x.inStock && !isAccessory(x, queryTokens))]) {
    if (!sameIds.has(l.itemId)) others.set(l.itemId, l)
  }
  let alternatives = [...others.values()]
  if (intent.maxPrice !== null || intent.minPrice !== null) {
    // Within budget, and not so cheap it can't stand in for the named product
    // (৳372 earphones aren't an alternative to ৳28,900 headphones "under 25000").
    const floor = 0.5 * Math.min(intent.maxPrice ?? Infinity, exact?.price ?? intent.maxPrice ?? 0)
    alternatives = alternatives.filter((l) => withinBudget(l, intent) && l.price >= floor)
  }
  else if (exact) alternatives = alternatives.filter((l) => l.price >= exact.price * 0.6 && l.price <= exact.price * 1.6)
  alternatives = scoreForNeed(alternatives, intent).slice(0, 4)

  return { ranked, alternatives, suspicious }
}
