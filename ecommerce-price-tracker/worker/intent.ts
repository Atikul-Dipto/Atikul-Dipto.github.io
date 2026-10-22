/**
 * Shopper request -> Intent. Port of ../agent/intent.py; the model here is
 * Workers AI's Llama 3.3 70B (free plan: 10,000 neurons/day, ~14 per call,
 * so ~700 requests/day; past that the call fails and parseRules() answers).
 * Picked on 2026-10-21 over Llama 3.1 8B (put "under 25k" in min_price) and
 * Qwen3 30B (spent its whole token budget thinking): correct on all five test
 * queries, Bangla included, in ~1.5s.
 *
 * Every field the model returns is checked against the raw text:
 * - a budget is only kept if that number actually appears in the query;
 * - price words are stripped from the search text (the budget goes to Daraz
 *   as a real price filter);
 * - "product" vs "need" is decided by rule, not by the model.
 */

import { modelTokens, QUANTITY_RE, tokens } from './ranking.ts'
import type { Env, Intent } from './types.ts'

export const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'

const SYSTEM_PROMPT = `You turn a Bangladeshi online shopper's request into JSON for a product search on Daraz.
The request may be English, Bangla, or mixed. Return ONLY JSON with keys:
 "search_query": the short English keyword query to type into Daraz search, 2-6 words, NO price or budget words,
 "brand": brand name or null,
 "min_price": number in BDT or null,
 "max_price": number in BDT or null ("25k" means 25000),
 "must_have": list of short English feature phrases they asked for (empty list if none),
 "product_type": the kind of item in English, e.g. "smartphone", "headphones", "rice", "laptop".`

const BANGLA_DIGITS = '০১২৩৪৫৬৭৮৯'
export const normalize = (text: string) => text.replace(/[০-৯]/g, (d) => String(BANGLA_DIGITS.indexOf(d)))

// Budget words and price-sized numbers only (k-suffixed or 4+ digits) — small
// numbers are usually part of the product ("iPhone 15", "5kg").
// A number right after a budget word goes with it ("under 999"), as do
// "50 thousand" and "২০ হাজার".
const PRICE_WORDS_RE =
  /\b(?:under|below|less than|within|upto|up to|budget|around|max)\s*৳?\s*\d[\d,]*(?:\.\d+)?\s*k?\b|\b(under|below|less than|within|upto|up to|budget|between|tk|taka|bdt)\b|৳|টাকা|\b\d+(?:\.\d+)?\s*(?:k|thousand|hajar)\b|\d+\s*হাজার|\b\d{1,3}(?:,\d{3})+\b|\b\d{4,}\b/gi
const MAX_HINTS = /under|below|less than|within|upto|up to|max|budget|মধ্যে|নিচে/i
const MIN_HINTS = /above|over|more than|at least|min|উপরে/i

/** Every amount mentioned, with "25k" / "25 হাজার" expanded. */
export function queryNumbers(text: string): Set<number> {
  const found = new Set<number>()
  for (const [, value, suffix] of normalize(text).matchAll(/(\d+(?:[.,]\d+)*)\s*(k\b|thousand|hajar|হাজার)?/gi)) {
    let amount = Number(value.replace(/,/g, ''))
    if (!Number.isFinite(amount)) continue
    if (suffix) amount *= 1000
    found.add(amount)
  }
  return found
}

export const groundedPrice = (value: unknown, numbers: Set<number>): number | null => {
  const n = Number(value)
  return value != null && value !== '' && Number.isFinite(n) && n > 0 && numbers.has(n) ? n : null
}

export const cleanSearchQuery = (q: string) => normalize(q).replace(PRICE_WORDS_RE, ' ').replace(/\s+/g, ' ').trim()

/** No-LLM fallback: budget from regex, everything else is the raw text. */
export function parseRules(query: string): Intent {
  const text = normalize(query)
  const numbers = [...queryNumbers(text)].filter((n) => n >= 100).sort((a, b) => a - b)
  let minPrice: number | null = null
  let maxPrice: number | null = null
  if (numbers.length >= 2 && /between|-|to/i.test(text)) [minPrice, maxPrice] = [numbers[0], numbers[numbers.length - 1]]
  else if (numbers.length && MAX_HINTS.test(text)) maxPrice = numbers[numbers.length - 1]
  else if (numbers.length && MIN_HINTS.test(text)) minPrice = numbers[0]
  return {
    rawQuery: query,
    mode: minPrice !== null || maxPrice !== null ? 'need' : 'product',
    searchQuery: cleanSearchQuery(query) || query,
    productType: null,
    brand: null,
    minPrice,
    maxPrice,
    mustHave: [],
    source: 'rules',
  }
}

function parseModelJson(response: unknown): Record<string, unknown> | null {
  if (response && typeof response === 'object') return response as Record<string, unknown>
  if (typeof response !== 'string') return null
  const match = /\{[\s\S]*\}/.exec(response)
  try {
    return match ? JSON.parse(match[0]) : null
  } catch {
    return null
  }
}

/** " 14" if the shopper typed "note 14" and the search text lost the 14. */
export function restoreModelNumbers(query: string, searchQuery: string): string {
  const have = new Set(searchQuery.toLowerCase().match(/[a-z0-9]+/g) ?? [])
  const missing = (cleanSearchQuery(query).toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (t) => /\d/.test(t) && !have.has(t) && !new RegExp(`^${QUANTITY_RE.source}$`, 'i').test(t),
  )
  return missing.length ? ' ' + missing.join(' ') : ''
}

const isQuantity = (s: string) => new RegExp(`^${QUANTITY_RE.source}$`, 'i').test(s.trim())

/**
 * `context` is the product name from the other box, when there is one: it
 * tells the model what kind of item the needs are about ("under 25000" means
 * headphones if the name is a pair of headphones). Budgets are still only
 * accepted if they appear in `query` itself.
 */
export async function parseIntent(query: string, env: Env, context = ''): Promise<Intent> {
  query = query.trim()
  if (!env.AI) return parseRules(query)
  let data: Record<string, unknown> | null = null
  try {
    const result = await env.AI.run(MODEL, {
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: context ? `Product they are looking at: ${context}\nWhat they need: ${query}` : query },
      ],
      max_tokens: 200,
      temperature: 0,
      response_format: { type: 'json_object' },
    })
    data = parseModelJson(result.response)
  } catch {
    data = null // daily free allocation used up, or AI unavailable
  }
  if (!data) return parseRules(query)

  const numbers = queryNumbers(query)
  const brand = (data.brand as string) || null
  const productType = (data.product_type as string) || null
  let searchQuery = cleanSearchQuery(String(data.search_query ?? '')) || cleanSearchQuery(query) || query
  let mustHave = (Array.isArray(data.must_have) ? data.must_have : []).map((f) => String(f).trim()).filter(Boolean)
  const minPrice = groundedPrice(data.min_price, numbers)
  const maxPrice = groundedPrice(data.max_price, numbers)
  // By rule: a budget or a wished-for feature makes it a need; otherwise the
  // shopper named the thing ("miniket rice 5kg" must not become just "rice").
  mustHave = mustHave.filter((f) => !isQuantity(f))
  // Given the product name as context, the model sometimes lifts its words
  // into the needs ("RGB" from "...RGB Mechanical Keyboard" when the shopper
  // only wrote "under 1400"). A feature counts only if it isn't just echoing the name.
  if (context) {
    const own = query.toLowerCase()
    mustHave = mustHave.filter((f) => !tokens(f).some((k) => context.toLowerCase().includes(k) && !own.includes(k)))
  }
  // A model code ("KL69", "A36") means they named it, whatever else they
  // wrote: "Jedel KL69 61 Keys RGB Mechanical Keyboard" must not turn into a
  // feature hunt for "Jedel keyboard".
  const named = modelTokens(tokens(cleanSearchQuery(query))).length > 0
  const mode = !named && (maxPrice || minPrice || mustHave.length) ? 'need' : 'product'

  if (mode === 'need' && productType) {
    // Search the kind of item; features are for ranking. "phone camera" finds
    // security cameras, "smartphone" + a price filter finds phones.
    searchQuery = brand ? `${brand} ${productType}` : productType
  } else {
    // The model tends to drop sizes, which tell a 5kg bag from a 25kg sack.
    const size = new RegExp(QUANTITY_RE.source, 'i').exec(normalize(query))
    if (size && !new RegExp(QUANTITY_RE.source, 'i').test(searchQuery)) searchQuery += ` ${size[1]}${size[2].toLowerCase()}`
    // ...and model numbers: "Xiaomi Redmi Note 14" came back as "Xiaomi Redmi
    // Note", which found a Note 17. Any digit-bearing word the shopper typed
    // goes back in.
    searchQuery += restoreModelNumbers(query, searchQuery)
  }
  return { rawQuery: query, mode, searchQuery, productType, brand, minPrice, maxPrice, mustHave, source: 'llm' }
}

/**
 * The two-box form: `name` is a product name, searched exactly as typed —
 * the AI never rewrites it (long, specific titles are exactly what it
 * misreads). `details` is what the shopper needs (features, budget, any
 * language) and is the only text the AI reads. With a name, details decide
 * the "best choice" shown beneath the named product; on their own they're a
 * description search, as before.
 */
/**
 * A short second search built from the shopper's own words, no AI: the first
 * word (usually the brand) plus the model code — "Jedel KL69" from "Jedel
 * KL69 61 Keys RGB Mechanical Keyboard". Daraz returns different result sets
 * for the same long title (7 listings one time, 40 the next); a model-code
 * search reliably lists every seller. null when there's no model code.
 */
export function coreQuery(name: string): string | null {
  const words = cleanSearchQuery(name).split(' ').filter(Boolean)
  if (!modelTokens(tokens(words.join(' '))).length) return null
  const keep = new Set<number>([0])
  words.forEach((w, i) => {
    const prev = words[i - 1] ?? ''
    if (modelTokens(tokens(w)).length) {
      keep.add(i) // "KL69", "A36", "WH-1000XM5"
      if (/^[a-z]{1,3}$/i.test(prev)) keep.add(i - 1) // "WH 1000XM5"
    } else if (/^\d+$/.test(w) && modelTokens(tokens(`${prev} ${w}`)).includes(tokens(prev).join('') + w)) {
      keep.add(i - 1) // "Note 14" — but not "KL69 61", where 61 is a key count
      keep.add(i)
    }
  })
  const core = words.filter((_, i) => keep.has(i)).join(' ')
  return core.toLowerCase() === words.join(' ').toLowerCase() ? null : core
}

/**
 * What kind of thing the named product is, from its own name: the words left
 * once the brand (first word), model code and specs are taken out — "RGB
 * Mechanical Keyboard" from "Jedel KL69 61 Keys RGB Mechanical Keyboard".
 * Searched for alternatives when the shopper gave no "what do you need" text.
 */
export function describeQuery(name: string): string | null {
  const words = cleanSearchQuery(name).split(' ').filter(Boolean)
  const kept = words.slice(1).filter((w, i, rest) => {
    const t = tokens(w)
    if (!t.length || t.some((x) => /\d/.test(x))) return false // model codes, sizes, counts
    if (['keys', 'key', 'gb', 'tb', 'mah', 'pcs', 'pc'].includes(t[0])) return false // the unit of a spec ("61 Keys")
    const next = rest[i + 1] ?? ''
    return !(/^[a-z]{1,3}$/i.test(w) && modelTokens(tokens(next)).length) // "WH" of "WH 1000XM5"
  })
  return kept.length ? kept.join(' ') : null
}

export async function buildIntent(name: string, details: string, env: Env): Promise<Intent> {
  name = name.replace(/\s+/g, ' ').trim()
  details = details.replace(/\s+/g, ' ').trim()
  if (!name) return parseIntent(details, env)

  const typed = parseRules(name) // a budget typed into the name box still counts
  const wish = details ? await parseIntent(details, env, name) : null
  return {
    rawQuery: details ? `${name} — ${details}` : name,
    mode: 'product',
    searchQuery: cleanSearchQuery(name) || name,
    productType: wish?.productType ?? null,
    brand: wish?.brand ?? null,
    minPrice: wish?.minPrice ?? typed.minPrice,
    maxPrice: wish?.maxPrice ?? typed.maxPrice,
    mustHave: wish?.mustHave ?? [],
    source: wish ? wish.source : 'typed',
  }
}
