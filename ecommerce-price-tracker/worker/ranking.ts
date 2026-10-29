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
  // not 'glass': "track on glass" is a mouse feature; 'tempered' and 'protector' still catch screen glass
  'case', 'cover', 'protector', 'tempered', 'charger', 'cable', 'strap', 'holder',
  'adapter', 'skin', 'pouch', 'sticker', 'mount', 'stand', 'lens', 'film', 'bumper',
  'pad', 'mousepad', 'mat', // "Mouse" + "silk" put a silk-surface mouse pad first
  'housing', 'chassis', 'shell', 'replacement', 'spare', // parts: Cartup's "Samsung Galaxy A36" hits were housings and buttons
])
const PRICE_FLOOR_RATIO = 0.3
const OVERSEAS_PENALTY = 0.35
export const isOverseas = (l: Listing) => l.location.toLowerCase() === 'overseas'
// "good camera" is checked as "camera".
// Words that qualify or name a spec rather than state it: "good camera" is checked as
// "camera", "2k resolution" as "2k", "144hz refresh rate" as "144hz".
export const FEATURE_FILLER = new Set(['good', 'great', 'best', 'nice', 'long', 'big', 'high', 'strong', 'fast', 'excellent', 'better', 'quality', 'resolution', 'refresh', 'rate'])
export const QUANTITY_RE = /(\d+(?:\.\d+)?)\s*(kg|g|gm|gram|grams|l|ltr|litre|liter|ml|pcs|pc|pack)\b/gi
const UNIT_ALIASES: Record<string, string> = { gm: 'g', gram: 'g', grams: 'g', ltr: 'l', litre: 'l', liter: 'l', pc: 'pcs' }

export const tokens = (text: string): string[] => text.toLowerCase().match(/[a-z0-9]+/g) ?? []
export const compact = (text: string) => tokens(text).join('')

/** {"5kg"} from "Miniket Rice 5 KG" — normalized so spacing/case/alias don't matter. */
export function quantities(text: string): Set<string> {
  const found = new Set<string>()
  for (const [, amount, unit] of text.matchAll(QUANTITY_RE)) {
    const u = unit.toLowerCase()
    if (u === 'g' && isNetworkGen(`${amount}g`)) continue
    found.add(`${parseFloat(amount)}${UNIT_ALIASES[u] ?? u}`)
  }
  return found
}

// Spec values, not model names: "8gb" and "5000mah" describe a phone, "61 keys" a keyboard.
/** "5G" on a phone is the network, not 5 grams ("best 5G phone" lost its 5G as a weight). */
export const isNetworkGen = (t: string) => /^[3-6]g$/i.test(t.trim())
const SPEC_RE = /^\d+(?:gb|tb|mb|mah|hz|w|mp|inch|in|v|k|keys?|m|cm|mm|ft|g)$/
const SPEC_WORDS = new Set(['gb', 'tb', 'mb', 'mah', 'hz', 'w', 'mp', 'inch', 'key', 'keys', 'pcs', 'pc', 'months', 'month', 'years', 'year'])
const VARIANT_WORDS = new Set(['pro', 'plus', 'max', 'ultra', 'lite', 'mini', 'fe', 'neo', 'edge', 'prime'])
/**
 * "plus pro" from "Redmi Note 14 Pro Plus": the words that make it a different
 * model — only right after the model code (within 3 words), so "Ultra-fast
 * scrolling" deep in a mouse's title isn't an "Ultra" model. With no code,
 * only the first 6 words count.
 */
export function variantsOf(text: string, main?: string): string {
  const ts = tokens(text)
  return ts
    .filter((t, i) => VARIANT_WORDS.has(t) && (main ? ts.slice(Math.max(0, i - 3), i).join('').includes(main) : i < 6))
    .sort()
    .join(' ')
}

/** The most specific model code in a title (the longest), if it has one. */
export const mainModel = (text: string): string | undefined => modelTokens(tokens(text)).sort((a, b) => b.length - a.length)[0]
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

const nearSpelling = (a: string, b: string) =>
  /^[a-z]{4,}$/.test(a) && /^[a-z]{4,}$/.test(b) && Math.abs(a.length - b.length) <= 2 && (a.startsWith(b) || b.startsWith(a))

/**
 * Which of `want` (a title's words, in order) a name has, the way sellers
 * actually type: a letter or two off at the end ("waterproofe", "bags") or
 * two words run together ("Chest/Waist" as "chestwaist"). Plain words only —
 * "kl699" is not near "kl69".
 */
export function foundWords(want: string[], name: string): string[] {
  const have = new Set(tokens(name))
  return want.filter(
    (w, i) => have.has(w) || [...have].some((h) => nearSpelling(w, h) || (want[i + 1] && h === w + want[i + 1]) || (i > 0 && h === want[i - 1] + w)),
  )
}

/**
 * A short typed name with a model code: every word but the first (usually the
 * brand, often left out of titles) has to be in the title. A short code
 * can't identify a product alone — "3S" is in both the MX Master 3S and the
 * MX Anywhere 3S. Long names (pasted listing titles) aren't held to this:
 * sellers word those differently.
 */
export function namesAllOf(title: string, name: string): boolean {
  const want = tokens(name).filter((t) => !['for', 'with', 'and', 'the', 'of'].includes(t))
  if (want.length > 5) return true
  const have = new Set(tokens(title))
  const c = compact(title)
  return want.slice(1).every((w) => have.has(w) || (w.length > 2 && c.includes(w)))
}

/**
 * A seller a shopper can reasonably buy from: Daraz Mall, a product rated 4+
 * by at least 5 buyers, or (Cartup) a seller rated 90%+ positive — Cartup
 * products rarely have reviews yet, but its sellers' ratings are shown.
 */
export const trusted = (l: Listing) => l.officialStore || ((l.rating ?? 0) >= 4 && l.reviews >= 5) || (l.sellerPositive ?? 0) >= TRUSTED_SELLER

export function parseSold(sold: string): number {
  const m = /([\d.]+)\s*([kK])?/.exec(sold ?? '')
  if (!m) return 0
  const v = parseFloat(m[1])
  return m[2] ? Math.round(v * 1000) : Math.round(v)
}

/** A 5.0 from 2 reviews shouldn't beat a 4.7 from 900. */
export const bayesianRating = (rating: number | null, reviews: number, prior = 4, weight = 10) =>
  rating === null || reviews <= 0 ? prior : (reviews * rating + weight * prior) / (reviews + weight)

// Numbers are kept: "27 inch" has to mean 27 (it used to drop the "27" as too
// short, and every monitor with "inch" in its title matched).
const featureKeywords = (feature: string) => tokens(feature).filter((t) => !FEATURE_FILLER.has(t) && (t.length > 2 || /\d/.test(t)))
// The same spec written different ways in listing titles.
const SPEC_SYNONYMS: Record<string, string[]> = {
  '2k': ['2k', '1440p', 'qhd', 'wqhd', '2560'],
  '1440p': ['1440p', '2k', 'qhd', 'wqhd', '2560'],
  qhd: ['qhd', 'wqhd', '1440p', '2k', '2560'],
  '4k': ['4k', '2160p', 'uhd', '3840'],
  uhd: ['uhd', '4k', '2160p', '3840'],
  fhd: ['fhd', '1080p', '1920'],
  '1080p': ['1080p', 'fhd', '1920'],
}
// A unit right after a number is satisfied by the number in any notation: 27", 27-inch, 27 Inch.
const UNIT_WORDS = new Set(['inch', 'in', 'hz', 'gb', 'tb', 'mah', 'mp', 'w', 'watt', 'kg', 'ml', 'ltr', 'litre'])

function matchFeatures(listing: Listing, mustHave: string[]): string[] {
  const haystack = [listing.name, ...listing.highlights].join(' ').toLowerCase()
  return mustHave.filter((f) => {
    const kw = featureKeywords(f)
    return (
      kw.length > 0 &&
      kw.every((k, i) => {
        if (/^\d+$/.test(k)) return new RegExp(`(^|[^\\d.])${k}(?![\\d.])`).test(haystack)
        if (UNIT_WORDS.has(k) && i > 0 && /^\d+$/.test(kw[i - 1])) return true
        return (SPEC_SYNONYMS[k] ?? [k]).some((v) => haystack.includes(v))
      })
    )
  })
}

/** "256" from "8+256GB", "8/256GB" or "256GB ROM": the storage that tells variants apart. */
export function storageOf(name: string): number | null {
  const n = name.toLowerCase()
  const pair = /\b\d{1,2}\s*[+/]\s*(\d{2,4})\s*(?:gb)?\b/.exec(n)
  if (pair) return Number(pair[1])
  const sizes = [...n.matchAll(/\b(\d{2,4})\s*gb\b/g)].map((m) => Number(m[1])).filter((v) => v >= 32)
  const tb = /\b(\d)\s*tb\b/.exec(n)
  if (tb) sizes.push(Number(tb[1]) * 1024)
  return sizes.length ? Math.max(...sizes) : null
}

/**
 * A name without what tells sizes and variants apart — amounts ("5kg", "500
 * ml"), storage ("8/128GB", "256GB", "1TB") and variant words — leaving what
 * names the product line: "Pran Miniket Rice 25kg" -> "Pran Miniket Rice".
 */
export function withoutVariants(name: string): string {
  return name
    .replace(QUANTITY_RE, ' ')
    .replace(/\b\d{1,2}\s*[+/]\s*\d{2,4}\s*(?:gb)?\b|\b\d{1,4}\s*(?:gb|tb)\b/gi, ' ')
    .split(/\s+/)
    .filter((w) => !VARIANT_WORDS.has(w.toLowerCase()))
    .join(' ')
}

export function isAccessory(listing: Listing, queryTokens: string[]): boolean {
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

// A Cartup seller rated this positive counts like a Daraz Mall store in ranking:
// Cartup products rarely have reviews yet, so the seller rating is the evidence there is.
const TRUSTED_SELLER = 90

function trustScore(l: Listing): number {
  const vouched = l.officialStore || (l.sellerPositive ?? 0) >= TRUSTED_SELLER
  return bayesianRating(l.rating, l.reviews) / 5 + Math.min(Math.log10(parseSold(l.sold) + 1) / 4, 1) * 0.5 + (vouched ? 0.3 : 0)
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
    // The pull toward the budget only counts as far as there's evidence the
    // listing is any good: "mouse, 30k" put unrated ৳28k mice from a
    // cross-border seller above ৳249 ones rated 4.7 by 138 buyers.
    // Overseas listings (Daraz's cross-border "Choice" stock) count for half:
    // 49 of 80 "monitor" listings under ৳30k were one overseas seller's portable
    // screens, and they took every top spot from monitors in stock here.
    const vouched = l.officialStore || (l.sellerPositive ?? 0) >= TRUSTED_SELLER
    const evidence = (vouched ? 1 : Math.min(l.reviews / 10, 1)) * (isOverseas(l) ? 0.5 : 1)
    // Unrated listings start below the usual prior, for the same reason; and
    // shipping from abroad (slower, harder to return) costs a little more.
    const trust = (l.reviews > 0 || vouched ? trustScore(l) : trustScore(l) - 0.1) - (isOverseas(l) ? OVERSEAS_PENALTY : 0)
    l.relevance = Math.round((features * 1.5 + trust + budgetFit * 0.8 * evidence) * 1000) / 1000
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
  if (models.length) same = same.filter((l) => models.every((m) => compact(l.name).includes(m)) && namesAllOf(l.name, intent.searchQuery))
  // Variant words name a different model: "Redmi Note 14" is not the Note 14
  // Pro Plus, "iPhone 15" is not the 15 Pro Max. They must match both ways.
  const main = mainModel(intent.searchQuery)
  const wantedVariants = variantsOf(intent.searchQuery, main)
  same = same.filter((l) => variantsOf(l.name, main) === wantedVariants)
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
