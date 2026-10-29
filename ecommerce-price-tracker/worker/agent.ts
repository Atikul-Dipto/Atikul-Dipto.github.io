/**
 * The agent, as it runs on Cloudflare: one shopper request in, one answer out.
 * Port of ../agent/core.py — same steps, each timed and returned, because
 * "within a very short time" is the product's promise and has to stay
 * measurable:
 *
 *   understand  intent.buildIntent      the product name is taken as typed; only the
 *                                       "what do you need" text goes to Workers AI (~1.5s)
 *   search      daraz.search            ~0.7s, live (the name and the item type in parallel)
 *               cartup.lookup/browse    alongside: its name index + product pages, or its category pages
 *   scope       productCategory+search  only when Daraz's results are mostly noise (~1s)
 *   cartup      cartup.enrich           product pages for the Cartup listings about to be shown
 *   remember    store.lookupHistory     the price last seen, read before this one is recorded
 *   check       eligibility.checkAll    published voucher terms, pure arithmetic
 *
 * Every store gets its own answer (StoreAnswer): its recommended option and
 * why, then its matches. No store's pick is pushed over another's — where
 * both have the same product, each says how its price compares.
 */

import * as cartup from './cartup.ts'
import * as daraz from './daraz.ts'
import { bestVoucher, checkAll, listingHints, money } from './eligibility.ts'
import { buildIntent, coreQuery, describeQuery, parseIntent } from './intent.ts'
import { compact, foundWords, isAccessory, isBundle, mainModel, missingWords, modelTokens, namesAllOf, quantities, rank, sizesAgree, storageOf, tokens, trusted, variantsOf, withoutVariants } from './ranking.ts'
import * as store from './store.ts'
import type { Env, HistoryMatch, Intent, Listing, Voucher, VoucherCheck } from './types.ts'

const MIN_GOOD_RESULTS = 5
const RESULT_LIMIT = 6
const MATCH_LIMIT = 8
// Below this, leaving the closest-named trusted listing for a cheaper one isn't worth it.
const MIN_SAVING_RATIO = 0.02

export const CAVEATS = [
  'Vouchers are checked against their published terms (dates, minimum spend, cap, badges). Daraz makes the final call at checkout.',
  'Store vouchers and personal vouchers (new-user, Coins) only show to a logged-in Daraz account, so they are not included.',
  'Daraz allows one platform voucher per order, so the best single voucher is shown, not a sum.',
  "Cartup prices and stock are read live from its product pages. Reviews and seller ratings are the ones those pages show; Cartup's hidden search-engine ratings (every product “4.6–5.0 from ~1,300 ratings”) aren't real reviews and are ignored.",
]

export interface Result {
  listing: Listing
  history: HistoryMatch | null
  vouchers: VoucherCheck[]
  bestVoucher: VoucherCheck | null
  finalPrice: number
  hints: string[]
}

export interface StoreMatch extends Result {
  relation: 'same' | 'variant' | 'close' | 'fits' // how the row matches the product (see matchRows)
  label: string // the same, in words: "Same product", "Other size or variant", "Same as Cartup's pick"...
}

/** One store's part of the answer. More stores add more of these. */
export interface StoreAnswer {
  site: Listing['site']
  label: string
  recommended: Result | null
  why: string | null
  matches: StoreMatch[]
  note: string | null // why a store has nothing, or what it couldn't do
  link: string | null // the store's own results for this search, when there is one
}

export interface Answer {
  query: string
  intent: Intent
  stores: StoreAnswer[]
  summary: string
  checkedAt: string // when these prices were read from the stores (all live, in this answer)
  cartupCategories: string[] // the Cartup category pages browsed
  seen: number // listings Daraz's first search returned
  skippedSuspicious: number
  vouchersKnown: number
  vouchersHarvestedAt: string | null
  database: 'ok' | 'unavailable' | 'not needed'
  caveats: string[]
  timingsMs: Record<string, number>
}

const STOP = new Set(['for', 'with', 'and', 'the', 'of', 'new', 'original', 'pcs', 'pc', 'official', 'warranty'])
const words = (s: string) => tokens(s).filter((t) => !STOP.has(t))
// Words sellers add to any title; they never make it a different product.
const SALES_TALK = new Set(['premium', 'quality', 'high', 'best', 'special', 'genuine', 'authentic', 'imported', 'fresh', 'super', 'top', 'hot', 'sale', 'care'])
const COLOURS = new Set(['black', 'white', 'red', 'blue', 'green', 'pink', 'grey', 'gray', 'silver', 'gold', 'purple', 'yellow', 'orange', 'brown', 'graphite'])

type Relation = 'same' | 'variant' | 'close'

/**
 * How listings relate to the product `title` (the shopper's product name, or
 * a store's pick):
 *   same    — the product itself. Across stores, titles are written
 *             differently — Daraz's "Dahua LM27-B221B=V1 27 Inch Full HD..."
 *             is Cartup's "Dahua LM27-B221B 27 Inch IPS Monitor" — so instead
 *             of every code in the title, the main (longest) model code must
 *             match, with the same variant words (Pro/Plus/...), the same
 *             storage and size where both state one, and heavy word overlap.
 *   variant — the same product in another size, storage or variant
 *             ("Pran Miniket Rice 25kg" for "miniket rice 5kg").
 *   close   — most of its words, or a short name made of them ("Jordan Chest
 *             Bag" for the Air Jordan crossbody chest/waist bag).
 * Null for anything less. Out-of-stock listings and accessories never relate.
 */
export function relations(title: string): (l: Listing) => Relation | null {
  const main = mainModel(title)
  const [variants, storage, size] = [variantsOf(title, main), storageOf(title), quantities(title)]
  const titleTokens = tokens(title)
  // Which product line, whatever the size or variant: the identity words.
  const line = withoutVariants(title)
  const lineWords = [...new Set(words(line))]
  // A two-character code names nothing alone: "3S" is the MX Master 3S and
  // the MX Anywhere 3S, so the word before it ("master") must be there too —
  // unless it's the title's first word (the brand, often left out).
  const at = main && main.length <= 2 ? titleTokens.indexOf(main) : -1
  const lead = at > 1 && /^[a-z]+$/.test(titleTokens[at - 1]) ? titleTokens[at - 1] : null
  // With a model code, a close match is a sibling model: the same letters and
  // a nearby number — the KL68 for the KL69, the A26 or A37 for the A36, the
  // WH-1000XM4 for the XM5 — not the WF-1000XM5 earbuds or a Galaxy A07.
  // ("3S" is too short to have a family; the words decide there.)
  const shape = (code: string) => code.replace(/\d+/g, '#')
  const number = (code: string) => Number(code.replace(/\D/g, ''))
  const sibling = (name: string) =>
    !main ||
    main.length < 3 ||
    compact(name).includes(main) ||
    modelTokens(tokens(name)).some((c) => shape(c) === shape(main) && Math.abs(number(c) - number(main)) <= 0.3 * number(main))
  const bundle = isBundle(title)
  // Words a name adds between the title's own words name another product in
  // the same line: "Parachute Just for Baby – Milky Glow Lotion" isn't its
  // "Baby Lotion". A brand or description before or after them doesn't
  // ("Pran Miniket Rice", "Khan Rice Miniket premium Packet"), nor does sales talk.
  const lineOrder = words(line)
  // What kind of thing it is: the title's last plain word ("lotion", "bag",
  // "keyboard"), colours aside. A brand + model title ("MX Master 3S") has none.
  const tail = lineOrder.filter((w) => !COLOURS.has(w)).at(-1)
  const noun = tail && /^[a-z]+$/.test(tail) ? tail : null
  const joined = new Set(lineOrder.slice(1).map((w, i) => lineOrder[i] + w))
  const inserted = (nameLine: string) => {
    const ws = words(nameLine)
    const hit = ws.map((w) => joined.has(w) || foundWords([w], line).length > 0)
    const [first, last] = [hit.indexOf(true), hit.lastIndexOf(true)]
    return ws.some((w, i) => i > first && i < last && !hit[i] && !SALES_TALK.has(w))
  }
  const relate = (name: string, earlier = false): Relation | null => {
    // A combo or gift box isn't the product in it, or another size of it.
    if (isBundle(name) && !bundle) return null
    // Shares of each name's line words found in the other.
    const nameLine = withoutVariants(name)
    const nl = [...new Set(words(nameLine))]
    const ofTitle = foundWords(lineWords, nameLine).length / (lineWords.length || 1)
    const ofName = foundWords(nl, line).length / (nl.length || 1)
    // A close match keeps the make — the name's first or second word ("Air
    // Jordan", "Jedel KL69", "miniket rice") — not just its generic words
    // (a women's "waterproof crossbody chest waist bag" isn't an Air Jordan one).
    const sameMake = foundWords(lineWords.slice(0, 2), nameLine).length > 0
    // ...and is the same kind of thing: a Baby Shampoo isn't close to a Baby Lotion.
    const sameKind = !noun || foundWords([noun], nameLine).length > 0
    const close = sameMake && sameKind && sibling(name) && (ofTitle >= 0.6 || (ofTitle >= 0.4 && ofName >= 0.75)) ? 'close' : null
    if (main && !(compact(name).includes(main) && namesAllOf(name, title))) return close
    if (lead && !foundWords([lead], name).length) return close
    // With a model code in common, most words is enough. Without one, the
    // words are the identity: the name holds (nearly) all of the title's
    // ("Khan Rice Miniket premium 2 KG Packet" is miniket rice; "Teer
    // Nazirshail Rice 5kg" isn't), or is held in it and covers at least half
    // of it ("Jordan Chest Bag" doesn't). A renamed listing's earlier name
    // has to hold it all: a generic old "Kodomo Baby Lotion Powder 180ml"
    // doesn't make today's "(Extra Mild)" the Pink Hanabaki one. Held in it,
    // the name still needs the title's first word, usually the brand: a
    // plain "Mustard Oil 1 liter" isn't Radhuni's.
    const identity = main
      ? Math.max(ofTitle, ofName) >= 0.6
      : ofTitle >= 0.8 || (!earlier && ofName >= 0.8 && ofTitle >= 0.5 && foundWords(lineWords.slice(0, 1), nameLine).length > 0)
    if (!identity) return close
    const s = storageOf(name)
    const differs =
      variantsOf(name, main) !== variants ||
      (!main && inserted(nameLine)) ||
      (storage !== null && s !== null && s !== storage) ||
      (size.size > 0 && quantities(name).size > 0 && !sizesAgree(size, name))
    return differs ? 'variant' : 'same'
  }
  const order: (Relation | null)[] = ['same', 'variant', 'close', null]
  return (l) => {
    if (!l.inStock || isAccessory(l, titleTokens)) return null
    // A renamed Cartup listing is what it is under either of its names.
    const found = [relate(l.name), l.alsoNamed ? relate(l.alsoNamed, true) : null]
    return found.sort((a, b) => order.indexOf(a) - order.indexOf(b))[0]
  }
}

/** The listings that are the same product as `title`. */
export function sameProduct(listings: Listing[], title: string): Listing[] {
  const relate = relations(title)
  return listings.filter((l) => relate(l) === 'same')
}

/** Share of `title`'s words a listing has, under its best name. */
function closeness(l: Listing, title: string): number {
  const t = [...new Set(words(title))]
  return Math.max(...[l.name, l.alsoNamed].map((name) => (name ? foundWords(t, name).length / (t.length || 1) : 0)))
}

export interface Row {
  listing: Listing
  relation: StoreMatch['relation']
  label: string
  otherStore?: boolean // the other store's pick, carried here too
}

/**
 * A store's "More" list, every row matched to the product, best match first.
 * Named product: its other sellers (`same`, already vetted), then other sizes
 * or variants of it, then close matches. Kind of item: other sellers and
 * sizes of the store's pick, the other store's pick if this store has it too,
 * then the next best fits (`fits`). Nothing unrelated is added to fill it out.
 * `ref` is the price the rows are held against: a "match" at a third of it is
 * a part or a copy.
 */
export function matchRows(o: {
  intent: Intent
  title: string
  ref: Listing | null
  same: Listing[]
  pool: Listing[]
  otherPick?: { label: string; listing: Listing } | null
  fits?: Listing[]
}): Row[] {
  const named = o.intent.mode === 'product'
  const rows: Row[] = []
  const taken = new Set<string>()
  const add = (listing: Listing, relation: Row['relation'], label: string, otherStore = false) => {
    if (taken.has(listing.itemId)) return
    taken.add(listing.itemId)
    rows.push({ listing, relation, label, ...(otherStore && { otherStore }) })
  }
  const inBudget = (l: Listing) => (o.intent.maxPrice === null || l.price <= o.intent.maxPrice) && (o.intent.minPrice === null || l.price >= o.intent.minPrice)
  const floor = (o.ref?.price ?? 0) * 0.3
  const sameLabel = named ? 'Same product' : 'Same product, another seller'
  for (const l of o.same) add(l, 'same', sameLabel)

  const relate = o.title ? relations(o.title) : () => null
  const pool = o.pool.filter((l) => !taken.has(l.itemId) && l.price >= floor).map((l) => ({ l, r: relate(l) }))
  const cheapest = (r: Relation) => pool.filter((x) => x.r === r).map((x) => x.l).sort((a, b) => a.price - b.price)
  if (!named) {
    // A kind of item: rank vetted only the pick, so other sellers are held to its price.
    for (const l of cheapest('same')) if (inBudget(l) && l.price >= (o.ref?.price ?? 0) * 0.6) add(l, 'same', sameLabel)
    if (o.otherPick) for (const l of sameProduct(o.pool, o.otherPick.listing.name)) if (inBudget(l)) add(l, 'same', `Same as ${o.otherPick.label}'s pick`, true)
  }
  // Another size of a named product is shown whatever the budget; for a kind of item, within it.
  for (const l of cheapest('variant')) if (named || inBudget(l)) add(l, 'variant', 'Other size or variant')
  if (named) {
    const close = cheapest('close').sort((a, b) => closeness(b, o.title) - closeness(a, o.title))
    for (const l of close) if (inBudget(l)) add(l, 'close', 'Close match')
  }
  // Other fits are single products too, unless a bundle was asked for.
  const bundles = isBundle(o.intent.searchQuery)
  for (const l of o.fits ?? []) if (l.price >= floor && (bundles || !isBundle(l.name))) add(l, 'fits', 'Also fits')
  return rows
}

/** Closest title to `name` first (share of its words), then cheapest. */
function closestFirst(results: Result[], name: string): Result[] {
  const want = new Set(words(name))
  const score = (r: Result) =>
    Math.max(...[r.listing.name, r.listing.alsoNamed].map((n) => (n ? words(n).filter((w) => want.has(w)).length / (want.size || 1) : 0)))
  return [...results].sort((a, b) => score(b) - score(a) || a.finalPrice - b.finalPrice)
}

/** Why a listing counts as trusted, in the words the store itself uses. */
export function standing(l: Listing): string {
  if (l.officialStore) return 'Daraz Mall'
  if ((l.rating ?? 0) >= 4 && l.reviews >= 5) return `★ ${l.rating?.toFixed(1)} from ${l.reviews} reviews`
  if (l.sellerPositive) return `seller rated ${l.sellerPositive}% positive`
  return 'no ratings yet'
}

const sameSize = (a: Result, b: Result) => {
  const [x, y] = [storageOf(a.listing.name), storageOf(b.listing.name)]
  return x === null || y === null || x === y
}

/**
 * One store's recommendation for a named product, from its listings of that
 * product (closest title first): the cheapest from a seller worth trusting —
 * unless that's barely cheaper than a trusted closest match — or, with no
 * trusted seller, the closest match, said plainly.
 */
export function recommendHere(same: Result[], intent: Intent): { pick: Result | null; why: string | null } {
  if (!same.length) return { pick: null, why: null }
  const exact = same[0]
  const best = same.filter((r) => trusted(r.listing) && sameSize(r, exact)).sort((a, b) => a.finalPrice - b.finalPrice)[0]
  let pick = exact
  let why: string
  if (best && best !== exact && !(trusted(exact.listing) && best.finalPrice > exact.finalPrice * (1 - MIN_SAVING_RATIO))) {
    pick = best
    why = `The cheapest offer of it here from a seller worth trusting (${standing(best.listing)}).`
    const unrated = same.filter((r) => r.finalPrice < best.finalPrice && !trusted(r.listing)).length
    if (unrated) why += ` ${unrated} cheaper listing${unrated > 1 ? 's' : ''} from sellers without ratings ${unrated > 1 ? 'are' : 'is'} below.`
  } else if (trusted(exact.listing)) {
    why =
      same.length > 1
        ? `Closest match to the name, from a seller worth trusting (${standing(exact.listing)}); no one here has it meaningfully cheaper.`
        : `The only listing of it here (${standing(exact.listing)}).`
  } else {
    why = `Closest match to the name. Its seller has no ratings yet, so check before buying.`
  }
  if (intent.maxPrice !== null && pick.finalPrice > intent.maxPrice) why += ` It's over your ${money(intent.maxPrice)} budget — similar items below may fit.`
  return { pick, why }
}

/** What a listing actually has to go on, whether or not it clears the trust bar ("★ 5.0 from 2 reviews" is not "no ratings"). */
export function evidence(l: Listing): string {
  if (l.officialStore) return 'Daraz Mall'
  if (l.rating && l.reviews) return `★ ${l.rating.toFixed(1)} from ${l.reviews} review${l.reviews > 1 ? 's' : ''}`
  if (l.sellerPositive) return `seller rated ${l.sellerPositive}% positive`
  return 'no ratings yet'
}

/** For a kind of item: what made a store's top listing its best fit. */
function needWhy(pick: Result, intent: Intent, fit: Result = pick, otherStorePick: string | null = null): string {
  const missing = otherStorePick ? [] : missingWords(intent.searchQuery, fit.listing.name)
  const parts = [
    otherStorePick
      ? `${otherStorePick}'s pick, sold here too`
      : missing.length
        ? `No “${missing.join(' ')}” listing here — the best fit for the rest of what you typed`
        : 'Best fit here for what you described',
  ]
  if (fit.listing.matchedFeatures.length) parts.push(`mentions ${fit.listing.matchedFeatures.join(', ')}`)
  parts.push(evidence(pick.listing))
  if (intent.maxPrice !== null) parts.push(`within your ${money(intent.maxPrice)} budget`)
  return parts.join(' · ') + '.' + (pick !== fit ? ` Its cheapest offer here from a seller worth trusting (${standing(pick.listing)}).` : '')
}

/**
 * For a kind of item, the best fit is a product; what's recommended is its
 * best offer here: the cheapest from a seller worth trusting, when that's a
 * real saving (the MX Master 3S from Daraz Mall at ৳11,999, not ৳15,000 from
 * a seller with two reviews).
 */
export function bestOffer(fit: Result, offers: Result[]): Result {
  const cheaper = offers.filter((r) => trusted(r.listing) && sameSize(r, fit) && r.finalPrice < fit.finalPrice * (1 - MIN_SAVING_RATIO))
  return cheaper.sort((a, b) => a.finalPrice - b.finalPrice)[0] ?? fit
}

/**
 * For a kind of item, the stores' cards show the same product when one
 * store's pick is sold on the other too, so the prices compare like for like:
 * "lotion" had Daraz's Parachute Baby Lotion 100ml beside a ৳1,499 newborn
 * lotion on Cartup, which sold the Parachute one too, at ৳198. Of two picks
 * both stores sell, the one more buyers have reviewed (in both stores); if
 * neither store sells the other's pick, each keeps its own (null).
 */
export function sharedPick(a: { pick: Listing; elsewhere: Listing[] }, b: { pick: Listing; elsewhere: Listing[] }): 'a' | 'b' | null {
  const reviewed = (x: { pick: Listing; elsewhere: Listing[] }) => [x.pick, ...x.elsewhere].reduce((n, l) => n + l.reviews, 0)
  if (a.elsewhere.length && b.elsewhere.length) return reviewed(b) > reviewed(a) ? 'b' : 'a'
  return a.elsewhere.length ? 'a' : b.elsewhere.length ? 'b' : null
}

/** Of one product's listings on a store, the one to show: a seller worth trusting, then the cheapest. */
const firstOffer = (listings: Listing[]): Listing => [...listings].sort((x, y) => Number(trusted(y)) - Number(trusted(x)) || x.price - y.price)[0]

/** Two stores' listings of one product, judged from either title (one store's may say more). */
const samePicks = (a: Listing, b: Listing) => sameProduct([b], a.name).length > 0 || sameProduct([a], b.name).length > 0

/** Where two stores' picks are the same product, each says how its price compares — a fact, not a push. */
export function compareAcross(stores: StoreAnswer[]): void {
  for (const a of stores) {
    for (const b of stores) {
      if (a === b || !a.recommended || !b.recommended) continue
      if (!samePicks(a.recommended.listing, b.recommended.listing)) continue
      const diff = a.recommended.finalPrice - b.recommended.finalPrice
      const fact = diff === 0 ? `Same price as on ${b.label}.` : `${money(Math.abs(diff))} ${diff < 0 ? 'less' : 'more'} than on ${b.label}.`
      a.why = a.why ? `${a.why} ${fact}` : fact
    }
  }
}

function summarize(stores: StoreAnswer[]): string {
  return stores
    .map((s) => (s.recommended ? `${s.label}: ${s.recommended.listing.name} at ${money(s.recommended.finalPrice)} from ${s.recommended.listing.seller || s.label}.` : `${s.label}: ${s.note ?? 'nothing found.'}`))
    .join(' ')
}

/** Cartup categories for a named product's kind: its describing words, then just the noun ("RGB Mechanical Keyboard" → keyboards). */
function namedKinds(name: string): string[] {
  const d = describeQuery(name)
  if (!d) return []
  const last = d.split(' ').pop()
  return last && last !== d ? [d, last] : [d]
}

export interface AskInput {
  name?: string // a product name (or a kind of item), searched exactly as typed
  details?: string // what they need: features, budget — the only text the AI reads
  query?: string // one-box clients: a name or a description, worked out by the agent
}

export async function run(input: AskInput, env: Env, now = new Date()): Promise<Answer> {
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
  const query = input.query ?? [input.name, input.details].filter(Boolean).join(' — ')

  const intent = input.query !== undefined ? await parseIntent(input.query, env) : await buildIntent(input.name ?? '', input.details ?? '', env)
  lap('understand')

  const named = intent.mode === 'product'
  const db = env.PP_DB
  // A named product is searched with no price filter — they see what they
  // named whatever it costs; the budget goes to the search for alternatives.
  const budget = { minPrice: intent.minPrice, maxPrice: intent.maxPrice }
  // Daraz alternatives: the kind of item from the needs box when given,
  // otherwise from the name's own descriptive words.
  const altQuery = !named
    ? null
    : intent.productType && (intent.mustHave.length > 0 || intent.maxPrice !== null || intent.minPrice !== null)
      ? [intent.brand, intent.productType].filter(Boolean).join(' ')
      : describeQuery(intent.searchQuery)
  // Brand + model code ("Jedel KL69"): Daraz answers the same long title with
  // 7 listings one time and 40 the next; this reliably finds every seller.
  const core = named ? coreQuery(intent.searchQuery) : null
  // A kind of item with a budget: Daraz's first page for "monitor" under ৳30k
  // is mostly ৳3–6k screens, so also look near the budget (50–100% of it).
  // And the kind plus the shopper's describing words ("formal Shirt").
  const nearBudget =
    !named && intent.maxPrice ? { minPrice: Math.max(intent.minPrice ?? 0, Math.round(intent.maxPrice * 0.5)), maxPrice: intent.maxPrice } : null
  const refined = !named ? (intent.refinedQuery ?? null) : null
  const optional = (q: string | null, opts: Parameters<typeof daraz.search>[1] = {}) => (q ? daraz.search(q, opts).catch(() => null) : Promise.resolve(null))

  // Cartup runs alongside: what was typed through its name index, and the
  // kind of item through its category pages (for a named product, its kind's
  // categories give the similar items). A kind of item needs both: Cartup's
  // Radhuni mustard oil is in no "mustard oil" category, and "lotto" has none.
  const kinds = named ? namedKinds(intent.searchQuery) : [intent.refinedQuery, intent.productType, intent.searchQuery].filter((k): k is string => Boolean(k))
  const cartupLookup = cartup.lookup(db, intent.searchQuery)
  const cartupBrowse = kinds.length ? cartup.browse(db, kinds) : Promise.resolve(null)
  const [first, coreHits, alt, nearHits, refinedHits] = await Promise.all([
    daraz.search(intent.searchQuery, named ? {} : budget),
    optional(core),
    optional(altQuery, budget),
    optional(nearBudget ? intent.searchQuery : null, nearBudget ?? {}),
    optional(refined, budget),
  ])
  const extra = alt?.listings ?? []
  const pool = [...new Map([first, coreHits, nearHits, refinedHits].flatMap((r) => r?.listings ?? []).map((l) => [l.itemId, l])).values()]
  let { ranked, alternatives, suspicious } = rank(pool, intent, named ? MATCH_LIMIT + 1 : RESULT_LIMIT, extra)
  let searchUrl = first.url
  // Everything Daraz returned: where each "More" row is matched from.
  let darazAll = [...pool, ...extra]
  lap('search')

  if (ranked.length < MIN_GOOD_RESULTS && ranked.length > 0) {
    // The best real hit's own category (its product page knows it).
    const category = await daraz.productCategory(ranked[0].url).catch(() => null)
    if (category) {
      const scoped = await daraz.search(intent.searchQuery, { category, ...(named ? {} : budget) })
      // Merge, never replace: an oddly filed seed must not hide the first search's hits.
      const merged = new Map([...pool, ...scoped.listings].map((l) => [l.itemId, l]))
      darazAll = [...darazAll, ...scoped.listings]
      const rescored = rank([...merged.values()], intent, named ? MATCH_LIMIT + 1 : RESULT_LIMIT, extra)
      if (rescored.ranked.length > ranked.length) {
        ;({ ranked, alternatives, suspicious } = rescored)
        searchUrl = scoped.url
      }
    }
    lap('scope')
  }

  // Without a model code, rank keeps the titles that match best, whatever
  // they are; the product must still be the one named ("Women's Waist Bag
  // Oxford Cloth" isn't the Air Jordan crossbody chest/waist bag).
  const toName = relations(intent.searchQuery)
  if (named && !mainModel(intent.searchQuery)) ranked = ranked.filter((l) => toName(l) === 'same')

  // ---- Cartup, on its own terms ----
  // For a kind of item, Daraz's pick is looked for on Cartup and searched
  // again on Daraz itself (its other sellers and sizes), while Cartup's own
  // lookups finish.
  const darazPick = named ? null : (ranked[0] ?? null)
  const [found, browsedRaw, pickLookup, pickHits] = await Promise.all([
    cartupLookup,
    cartupBrowse,
    darazPick ? cartup.lookup(db, darazPick.name) : Promise.resolve(null),
    darazPick ? optional(coreQuery(darazPick.name) ?? darazPick.name.split(/\s+/).slice(0, 6).join(' ')) : Promise.resolve(null),
  ])
  darazAll = [...darazAll, ...(pickHits?.listings ?? [])]
  // Of same-named categories, keep the ones whose listings look like what Daraz found.
  const browsed = browsedRaw ? cartup.likeDaraz(browsedRaw, [...ranked, ...alternatives].slice(0, 10).map((l) => l.name), kinds) : null
  const unique = (ls: Listing[]) => [...new Map(ls.map((l) => [l.itemId, l])).values()]
  const cartupSame = named && found ? sameProduct(found.listings, intent.searchQuery) : []
  // Daraz's pick on Cartup: the listing itself and its other sizes.
  const toDarazPick = darazPick ? relations(darazPick.name) : () => null
  const pickOnCartup = (pickLookup?.listings ?? []).filter((l) => ['same', 'variant'].includes(toDarazPick(l) ?? ''))
  let cartupPool = unique([...(found?.listings ?? []), ...(browsed?.listings ?? []), ...pickOnCartup])
  // Category listings carry no seller or reviews: read the product pages of
  // the ones about to be shown before they're ranked or recommended.
  const toShow = (named ? cartupPool.filter((l) => !cartupSame.includes(l) && toName(l) !== null) : rank(cartupPool, intent, RESULT_LIMIT).ranked)
    .filter((l) => !l.seller)
    .slice(0, 4)
  if (toShow.length) {
    const full = new Map((await cartup.enrich(toShow)).map((l) => [l.itemId, l]))
    cartupPool = cartupPool.map((l) => full.get(l.itemId) ?? l)
  }
  const cartupRanked = named ? [] : rank(cartupPool, intent, RESULT_LIMIT).ranked
  const cartupPick = cartupRanked[0] ?? null
  // Cartup's own pick, by name, for its other sellers and sizes — unless it's
  // Daraz's pick, which was just looked up.
  // Daraz searched for it too, as Cartup was for Daraz's pick.
  if (cartupPick && !(darazPick && samePicks(darazPick, cartupPick))) {
    const [own, onDaraz] = await Promise.all([
      cartup.lookup(db, cartupPick.name),
      named ? Promise.resolve(null) : optional(coreQuery(cartupPick.name) ?? cartupPick.name.split(/\s+/).slice(0, 6).join(' ')),
    ])
    cartupPool = unique([...cartupPool, ...own.listings])
    darazAll = [...darazAll, ...(onDaraz?.listings ?? [])]
  }
  lap('cartup')

  // ---- each store's "More" rows, matched to the product ----
  const needRows = (pick: Listing | null, pool: Listing[], other: { label: string; listing: Listing } | null, fits: Listing[]) =>
    matchRows({ intent, title: pick?.name ?? '', ref: pick, same: [], pool, otherPick: other, fits })
  let darazRows = named
    ? matchRows({ intent, title: intent.searchQuery, ref: ranked[0] ?? null, same: ranked, pool: darazAll })
    : needRows(darazPick, darazAll, cartupPick && { label: 'Cartup', listing: cartupPick }, ranked.slice(1))
  let cartupRows = named
    ? matchRows({ intent, title: intent.searchQuery, ref: cartupSame[0] ?? ranked[0] ?? null, same: cartupSame, pool: cartupPool })
    : needRows(cartupPick, cartupPool, darazPick && { label: 'Daraz', listing: darazPick }, cartupRanked.slice(1))

  // A kind of item: where one store's pick is sold on the other too, both
  // cards show that product, and each store's own pick moves to its "More".
  let darazFit = darazPick
  let cartupFit = cartupPick
  let shared: 'daraz' | 'cartup' | null = null
  const elsewhere = (rows: Row[]) => rows.filter((r) => r.otherStore).map((r) => r.listing)
  if (!named && darazPick && cartupPick && samePicks(darazPick, cartupPick)) {
    // Already the same product: the other store's pick is just another seller of it here.
    for (const r of [...darazRows, ...cartupRows]) if (r.otherStore) Object.assign(r, { relation: 'same', label: 'Same product, another seller', otherStore: undefined })
  } else if (!named && darazPick && cartupPick) {
    const darazPickOnCartup = elsewhere(cartupRows)
    const cartupPickOnDaraz = elsewhere(darazRows)
    const which = sharedPick({ pick: darazPick, elsewhere: darazPickOnCartup }, { pick: cartupPick, elsewhere: cartupPickOnDaraz })
    shared = which === 'a' ? 'daraz' : which === 'b' ? 'cartup' : null
    if (shared === 'daraz') {
      cartupFit = firstOffer(darazPickOnCartup)
      darazRows = needRows(darazPick, darazAll, null, ranked.slice(1))
      cartupRows = needRows(cartupFit, cartupPool, null, [cartupPick, ...cartupRanked.slice(1)])
    } else if (shared === 'cartup') {
      darazFit = firstOffer(cartupPickOnDaraz)
      darazRows = needRows(darazFit, darazAll, null, [darazPick, ...ranked.slice(1)])
      cartupRows = needRows(cartupPick, cartupPool, null, cartupRanked.slice(1))
    }
  }

  const everything = unique([...ranked, ...cartupSame, ...cartupRanked, ...darazRows.map((r) => r.listing), ...cartupRows.map((r) => r.listing)])
  let history = new Map<string, HistoryMatch>()
  let vouchers: Voucher[] = []
  let harvestedAt: string | null = null
  let database: Answer['database'] = !db ? 'unavailable' : everything.length ? 'ok' : 'not needed'
  if (db) {
    try {
      ;[history, { vouchers, harvestedAt }] = await Promise.all([store.lookupHistory(db, everything), store.loadVouchers(db, today)])
      if (everything.length) await store.recordListings(db, everything, nowIso)
    } catch {
      database = 'unavailable' // the answer must never sink with the database
    }
  }
  lap('remember')

  const results = new Map<string, Result>()
  const toResult = (listing: Listing): Result => {
    const known = results.get(listing.itemId)
    if (known) return known
    const checks = checkAll(vouchers, listing, today)
    const bv = bestVoucher(checks)
    const result = { listing, history: history.get(listing.itemId) ?? null, vouchers: checks, bestVoucher: bv, finalPrice: listing.price - (bv?.saving ?? 0), hints: listingHints(listing) }
    results.set(listing.itemId, result)
    return result
  }
  // The pick's other sellers on its own store, as offers to choose between.
  const offersOf = (rows: Row[]) => rows.filter((r) => r.relation === 'same' && !r.otherStore).map((r) => toResult(r.listing))
  const matchesBesides = (rows: Row[], pick: Result | null): StoreMatch[] =>
    rows
      .filter((r) => r.listing.itemId !== pick?.listing.itemId)
      .slice(0, MATCH_LIMIT)
      .map((r) => ({ ...toResult(r.listing), relation: r.relation, label: r.label }))

  // ---- one answer per store ----
  const darazResults = ranked.map(toResult)
  const darazStore: StoreAnswer = { site: 'daraz', label: 'Daraz', recommended: null, why: null, matches: [], note: null, link: searchUrl }
  if (named) {
    const { pick, why } = recommendHere(darazResults, intent)
    darazStore.recommended = pick
    darazStore.why = why
    darazStore.matches = matchesBesides(darazRows, pick)
    if (!pick)
      darazStore.note = first.listings.length
        ? `No in-stock listing of “${intent.searchQuery}” itself — Daraz's ${first.listings.length} results were accessories, other models, or sold out.`
        : `Nothing on Daraz matched “${intent.searchQuery}” right now.`
  } else {
    const fit = darazFit ? toResult(darazFit) : null
    darazStore.recommended = fit && bestOffer(fit, offersOf(darazRows))
    darazStore.why = fit && needWhy(darazStore.recommended!, intent, fit, shared === 'cartup' ? 'Cartup' : null)
    darazStore.matches = matchesBesides(darazRows, darazStore.recommended)
    if (!darazResults.length) darazStore.note = 'Nothing on Daraz matched what you described right now.'
  }

  const categories = browsed?.categories ?? []
  const cartupStore: StoreAnswer = {
    site: 'cartup',
    label: 'Cartup',
    recommended: null,
    why: null,
    matches: [],
    note: null,
    link: categories[0] ? `https://www.cartup.com/category/${categories[0]}` : null,
  }
  if (named) {
    const same = closestFirst(cartupSame.map(toResult), intent.searchQuery)
    const { pick, why } = recommendHere(same, intent)
    cartupStore.recommended = pick
    cartupStore.why = why
    cartupStore.matches = matchesBesides(cartupRows, pick)
    if (!pick) {
      const why = found?.status === 'no_index' ? "Cartup comparison isn't set up yet." : found?.status === 'error' ? "Couldn't reach Cartup just now." : "Cartup doesn't list this product right now."
      cartupStore.note = cartupStore.matches.length ? `${why} Its closest matches are below.` : why
    }
  } else {
    const fit = cartupFit ? toResult(cartupFit) : null
    cartupStore.recommended = fit && bestOffer(fit, offersOf(cartupRows))
    cartupStore.why = fit && needWhy(cartupStore.recommended!, intent, fit, shared === 'daraz' ? 'Daraz' : null)
    cartupStore.matches = matchesBesides(cartupRows, cartupStore.recommended)
    if (!fit)
      cartupStore.note = categories.length
        ? `Nothing in Cartup's ${categories.map((c) => c.replace(/_\d+$/, '').replace(/_+/g, ' ')).join(' and ')} pages fits what you described.`
        : `Nothing on Cartup is listed as “${intent.searchQuery}”, and it has no section for this kind of item.`
  }

  const stores = [darazStore, cartupStore]
  compareAcross(stores)
  const summary = summarize(stores)
  lap('check')
  timings.total = Date.now() - t0

  return {
    query,
    intent,
    stores,
    summary,
    checkedAt: nowIso,
    cartupCategories: categories,
    seen: first.listings.length,
    skippedSuspicious: named ? suspicious : 0,
    vouchersKnown: vouchers.length,
    vouchersHarvestedAt: harvestedAt,
    database,
    caveats: CAVEATS,
    timingsMs: timings,
  }
}
