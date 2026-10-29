// Offline tests for the Cloudflare port — same cases as ../tests/test_agent.py,
// so the two copies of the rules stay in lockstep. No network, AI or D1.
//   node --test ecommerce-price-tracker/worker/agent.test.ts
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { bestOffer, compareAcross, evidence, matchRows, recommendHere, relations, type Result, sameProduct, sharedPick, type StoreAnswer, standing } from './agent.ts'
import { decodeIds, fnv1a, likeDaraz, parseCategoryPage, parseProductPage, pickCategories, requiredWords } from './cartup.ts'
import { bestVoucher, campaignName, check, checkAll } from './eligibility.ts'
import { buildIntent, cleanSearchQuery, coreQuery, describeQuery, groundedPrice, namesAProduct, parseRules, queryNumbers, restoreModelNumbers } from './intent.ts'
import { foundWords, isBundle, missingWords, modelTokens, quantities, rank, storageOf, tokens, trusted, variantsOf } from './ranking.ts'
import type { Intent, Listing, Voucher } from './types.ts'

const CAMPAIGN = 'https://pages.daraz.com.bd/wow/gcp/route/daraz/bd/upr/router?wh_pid=%2Flazada%2Fchannel%2Fbd%2Fweekly-campaigns%2FbKashChoice'
const TODAY = '2026-10-21'

let n = 0
const listing = (name: string, price: number, extra: Partial<Listing> = {}): Listing => ({
  site: 'daraz', itemId: String(++n), name, url: `https://www.daraz.com.bd/products/x-i${n}.html`, image: '', price,
  originalPrice: null, discountPercent: null, seller: 'Seller', brand: '', rating: 4.5, reviews: 10, sold: '', inStock: true,
  location: '', officialStore: false, badges: [], highlights: [], relevance: 0, matchedFeatures: [], ...extra,
})
const product = (q: string): Intent => ({ rawQuery: q, mode: 'product', searchQuery: q, productType: null, brand: null, minPrice: null, maxPrice: null, mustHave: [], source: 'rules' })

const flat: Voucher = { site: 'daraz', title: 'Daraz Voucher', labels: ['Limited Redemption', 'bKash Choice Exclusive'], amount: 50, percent: null, maxDiscount: null, minSpend: 399, validFrom: '2026-10-16', validTo: '2026-10-22', sourceUrl: CAMPAIGN }
const percent: Voucher = { ...flat, labels: [], amount: null, percent: 10, maxDiscount: 300, minSpend: 1000, validFrom: '2026-11-01', validTo: '2026-11-12', sourceUrl: 'https://pages.daraz.com.bd/wow/x?wh_pid=/lazada/channel/bd/homepage/home' }

test('over the minimum: conditional, with the conditions spelled out', () => {
  const c = check(flat, listing('Special Miniket Rice 5Kg', 490), TODAY)
  assert.equal(c.status, 'conditional')
  assert.equal(c.saving, 50)
  assert.ok(c.conditions.includes('Pay with bKash'))
  assert.ok(c.conditions.some((x) => x.includes('bKashChoice campaign')))
})

test('under the minimum reports the gap', () => {
  const c = check(flat, listing('Lux Soap 90g', 59), TODAY)
  assert.equal(c.status, 'not_applicable')
  assert.match(c.reasons[0], /৳340 short/)
})

test('expired and not-yet-started', () => {
  assert.equal(check(flat, listing('x', 500), '2026-10-23').status, 'not_applicable')
  assert.equal(check(percent, listing('x', 5000), TODAY).status, 'not_applicable')
})

test('percent vouchers are capped, and the best single voucher wins', () => {
  assert.equal(check(percent, listing('x', 5000), '2026-11-05').saving, 300)
  assert.equal(bestVoucher(checkAll([flat, percent], listing('x', 5000), '2026-11-05'))?.saving, 300)
  assert.equal(campaignName(percent.sourceUrl), null)
})

test('budget parsing and grounding', () => {
  assert.deepEqual([parseRules('phone under 25k').mode, parseRules('phone under 25k').maxPrice], ['need', 25000])
  assert.equal(parseRules('ভালো ফোন ১৫০০০ টাকার মধ্যে').maxPrice, 15000)
  const i = parseRules('iphone 15')
  assert.deepEqual([i.mode, i.searchQuery, i.maxPrice], ['product', 'iphone 15', null])
  const nums = queryNumbers('phone under 25k with good camera')
  assert.equal(groundedPrice(25000, nums), 25000)
  assert.equal(groundedPrice(30000, nums), null)
  assert.equal(cleanSearchQuery('miniket rice 5kg under 1,000 tk'), 'miniket rice 5kg')
})

test('model numbers the model dropped are restored', () => {
  assert.equal(restoreModelNumbers('Xiaomi Redmi Note 14', 'Xiaomi Redmi Note'), ' 14')
  assert.equal(restoreModelNumbers('realme note 60x under 20k', 'realme note'), ' 60x')
  assert.equal(restoreModelNumbers('miniket rice 5kg', 'miniket rice 5kg'), '')
})

test('accessories and other models dropped', () => {
  const { ranked } = rank(
    [listing('Samsung Galaxy A36 5G 8/128GB', 43571, { officialStore: true }), listing('Samsung Galaxy A56/A36 Anti Yellow Phone Case', 176), listing('Samsung Galaxy A56 5G 8/256GB', 52000)],
    product('Samsung Galaxy A36'),
  )
  assert.deepEqual(ranked.map((l) => l.price), [43571])
})

test('a bare number binds to the model name', () => {
  const { ranked } = rank([listing('iPhone 17 256GB', 127999), listing('Apple iPhone 15 128GB', 99000)], product('iphone 15'))
  assert.deepEqual(ranked.map((l) => l.price), [99000])
})

test('clones far below the official price are skipped and counted', () => {
  const { ranked, suspicious } = rank(
    [listing('Sony WH-1000XM5 Noise Canceling Headphones', 28900, { officialStore: true }), ...[0, 1, 2, 3].map((i) => listing(`COD 2023 New Sony WH-1000XM5 Headphones ${i}`, 2581 + i))],
    product('sony wh-1000xm5'),
  )
  assert.deepEqual([ranked.map((l) => l.price), suspicious], [[28900], 4])
})

test('wrong sizes and partial matches dropped', () => {
  const { ranked } = rank(
    [listing('Special Miniket Rice 5Kg', 490), listing('KHAN RICE Premium Miniket Rice - 25 kg', 2000), listing('Royal Umbrella Jasmine Rice 5KG', 1538)],
    product('miniket rice 5kg'),
  )
  assert.deepEqual(ranked.map((l) => l.name), ['Special Miniket Rice 5Kg'])
})

test('need mode prefers a good fit near the budget', () => {
  const intent: Intent = { ...product('smartphone'), mode: 'need', maxPrice: 25000, mustHave: ['good camera'] }
  const { ranked } = rank(
    [listing('Feature Phone with Digital Camera', 9000, { highlights: ['camera'] }), listing('realme C100x 6+128GB', 24399, { highlights: ['50MP AI camera'], reviews: 25, rating: 5 }), listing('Phone 30000', 30000, { highlights: ['camera'] })],
    intent,
  )
  assert.equal(ranked[0].price, 24399)
  assert.ok(!ranked.some((l) => l.price === 30000))
})

test('quantity normalization', () => {
  assert.deepEqual([...quantities('Rice 5 KG')], [...quantities('rice 5kg')])
  assert.deepEqual([...quantities('Oil 1 Litre')], ['1l'])
})

// The case that prompted the exact-first answer: Daraz's own listing names it
// word for word, other sellers word it differently, and a KL68 is not a KL69.
const KL69 = 'Jedel KL69 61 Keys RGB Mechanical Keyboard'
const kl69Listings = () => [
  listing('JEDEL-K500 Suspended USB Gaming Keyboard With Color Backlight', 617, { rating: 4.6, reviews: 120 }),
  listing('Jedel KL69 OEM Mechanical  61 Keys Wired Gaming Keyboard', 1510, { rating: null, reviews: 0 }),
  listing('Jedel KL69 61 Keys RGB Mechanical Keyboard', 1530, { rating: 4.79, reviews: 39 }),
  listing('Jedel KL69 OEM 61 Keys Wired Mechanical Gaming Keyboard', 1525, { rating: 5, reviews: 5 }),
  listing('Jedel  Kl 69 keys 61 Rgb Mechanical keyboard .', 1650, { rating: null, reviews: 0 }),
  listing('Jedel KL68 61 Keys Mechanical Gaming Wired  Keyboard', 2320),
  listing('JEDEL WS681 Mini Stylish 2.4ghz Wireless Gaming Keyboard', 1275),
]

test('a named model is the product, whatever features are typed with it', () => {
  assert.deepEqual(modelTokens(tokens(KL69)), ['kl69'])
  assert.deepEqual(modelTokens(tokens('phone with 8gb ram and 5000mah battery')), [])
})

test('the named product comes first; other sellers stay, other models move to alternatives', () => {
  const { ranked, alternatives } = rank(kl69Listings(), product(KL69))
  assert.equal(ranked[0].name, KL69)
  // other KL69 sellers, cheapest first — including the one who wrote "Kl 69"
  assert.deepEqual(ranked.slice(1).map((l) => l.price), [1510, 1525, 1650])
  assert.ok(!ranked.some((l) => /KL68|K500|WS681/.test(l.name)))
  assert.ok(alternatives.some((l) => l.name.includes('KL68')))
})

const asResult = (l: Listing): Result => ({ listing: l, history: null, vouchers: [], bestVoucher: null, finalPrice: l.price, hints: [] })

test('recommended here: a ৳5 saving is not worth leaving the closest trusted listing', () => {
  const { ranked } = rank(kl69Listings(), product(KL69))
  assert.equal(recommendHere(ranked.map(asResult), product(KL69)).pick?.listing.price, 1530)
})

test('recommended here: the same product meaningfully cheaper from a trusted seller', () => {
  const items = [listing(KL69, 1530, { rating: 4.8, reviews: 39 }), listing('Jedel KL69 OEM 61 Keys Keyboard', 1400, { rating: 4.5, reviews: 12 }), listing('Jedel KL69 Keyboard', 1300, { rating: null, reviews: 0 })]
  const { pick, why } = recommendHere(rank(items, product(KL69)).ranked.map(asResult), product(KL69))
  assert.equal(pick?.listing.price, 1400) // the unrated ৳1,300 seller isn't recommended, but is mentioned
  assert.match(why!, /1 cheaper listing from sellers without ratings is below/)
})

test('recommended here: over budget is said, and the named one is still shown', () => {
  const wishes: Intent = { ...product(KL69), maxPrice: 1400 }
  const { pick, why } = recommendHere(rank(kl69Listings(), wishes).ranked.map(asResult), wishes)
  assert.equal(pick?.listing.price, 1530)
  assert.match(why!, /over your ৳1,400 budget/)
})

test('search helpers built from the shopper\'s own words, no AI', () => {
  assert.equal(coreQuery(KL69), 'Jedel KL69') // "61" is a key count, not part of the model
  assert.equal(coreQuery('Xiaomi Redmi Note 14'), 'Xiaomi Note 14')
  assert.equal(coreQuery('miniket rice 5kg'), null)
  assert.equal(describeQuery(KL69), 'RGB Mechanical Keyboard')
  assert.equal(describeQuery('sony wh-1000xm5'), null)
})

test('WH-1000XM5 headphones are not the WF-1000XM5 earbuds', () => {
  const { ranked } = rank(
    [listing('Sony WH-1000XM5 Noise Canceling Headphones', 28900, { officialStore: true }), listing('SONY WF-1000XM5 Noise Cancelling Earbuds', 30900)],
    product('sony wh-1000xm5'),
  )
  assert.deepEqual(ranked.map((l) => l.price), [28900])
})

test('variant words name a different model', () => {
  const items = [listing('Xiaomi Redmi Note 14 Pro Plus 5g (12+256GB)', 38999, { rating: 5, reviews: 1 }), listing('Xiaomi Redmi Note 14(8/128GB) Official', 30999)]
  assert.deepEqual(rank(items, product('Xiaomi Redmi Note 14')).ranked.map((l) => l.price), [30999])
  assert.deepEqual(rank(items, product('Redmi Note 14 Pro Plus')).ranked.map((l) => l.price), [38999])
})

// Real searches from the log after the two-box change: a kind of item typed
// in the product box ("monitor" + "30k") came back as a ৳5,993 Raspberry Pi
// screen labelled "the product you asked for".
test('a kind of item in the product box is a best-fit search, not a named product', () => {
  for (const kind of ['monitor', 'Shampoo', 'mouse', 'formal shirt', 'Walton refrigerator']) assert.equal(namesAProduct(kind), false, kind)
  for (const name of ['Jedel KL69 61 Keys RGB Mechanical Keyboard', 'Samsung Galaxy A36', 'miniket rice 5kg', 'sony wh-1000xm5', 'Xiaomi Redmi Note 14'])
    assert.equal(namesAProduct(name), true, name)
})

test('a lone amount in the needs box is a budget', () => {
  assert.equal(parseRules('30k', true).maxPrice, 30000)
  assert.equal(parseRules('১৫০০০', true).maxPrice, 15000)
  assert.equal(parseRules('iphone 15').maxPrice, null)
})

test('monitor + 30k: best fit near the budget, not the first cheap screen', async () => {
  const intent = await buildIntent('monitor', '30k', {}) // no AI here: the rules read "30k"
  assert.deepEqual([intent.mode, intent.searchQuery, intent.maxPrice], ['need', 'monitor', 30000])
  const { ranked } = rank(
    [
      listing('Raspberry Pi 7 Inch NONTouch Screen IPS 1024x600 HD LCD HDMI', 5993, { rating: 5, reviews: 1 }),
      listing('Wintech WM-17V 17 Inch LED Monitor', 3100),
      listing('Samsung 27 inch Curved Monitor LS27C360EAWXXL', 24500, { officialStore: true, rating: 4.8, reviews: 40 }),
      listing('MSI PRO MP243X 24 inch 100Hz Monitor', 15900, { rating: 4.7, reviews: 22 }),
    ],
    intent,
  )
  assert.equal(ranked[0].price, 24500)
})

test('mouse + 30k: a near-budget price does not beat evidence', () => {
  const intent: Intent = { ...product('mouse'), mode: 'need', maxPrice: 30000 }
  const { ranked } = rank(
    [listing('MCHOSE A7 V2 Ultra Plus Wireless Gaming Mouse', 28207, { rating: null, reviews: 0 }), listing('HP W10 Rechargeable Wireless Bluetooth Mouse', 298, { rating: 4.8, reviews: 351 })],
    intent,
  )
  assert.equal(ranked[0].price, 298)
})

test('"27 inch" means 27 inches, not any title with "inch" in it', () => {
  const intent: Intent = { ...product('monitor'), mode: 'need', maxPrice: 25000, mustHave: ['27 inch'] }
  const { ranked } = rank(
    [listing('ZSUS 14-inch 2K Portable Monitor', 13280, { rating: 5, reviews: 30 }), listing('Dahua LM27-B221B 27 Inch Full HD 100Hz IPS Monitor', 17000, { rating: 4.5, reviews: 6 })],
    intent,
  )
  assert.equal(ranked[0].price, 17000)
  assert.deepEqual(ranked[0].matchedFeatures, ['27 inch'])
})

test('the shopper\'s own describing words reach the search, even when the AI drops them', async () => {
  const ai = { AI: { run: async () => ({ response: { search_query: 'shirt', brand: null, min_price: null, max_price: 1000, must_have: [], product_type: 'shirt' } }) } }
  const shirt = await buildIntent('Shirt', 'Under 1000, formal', ai)
  assert.deepEqual([shirt.refinedQuery, shirt.mustHave, shirt.maxPrice], ['formal Shirt', ['formal'], 1000])
  const monitor = await buildIntent('monitor', '27 inch under 25000', {})
  assert.equal(monitor.refinedQuery, '27 inch monitor') // works with the AI down, too: these are the shopper's own words
})

test('a different storage size is not "the same product, cheaper"', () => {
  assert.equal(storageOf('Xiaomi Redmi Note 14 5G (8+256GB)'), 256)
  assert.equal(storageOf('Redmi Note 14(8/128GB) Official'), 128)
  // Asked for the 256GB: the official 128GB is cheaper and trusted, but it's not the same product.
  const asked = product('Xiaomi Redmi Note 14 8/256GB')
  const items = [listing('Xiaomi Redmi Note 14 5G (8+256GB)', 29999, { rating: 4.8, reviews: 30 }), listing('Xiaomi Redmi Note 14 5G (8+128GB)', 26999, { officialStore: true })]
  const { pick, why } = recommendHere(rank(items, asked).ranked.map(asResult), asked)
  assert.equal(pick?.listing.price, 29999)
  assert.doesNotMatch(why!, /cheapest/)
})

test('monitor + 30k: monitors in stock here beat an overseas seller\'s portable screens', () => {
  const intent: Intent = { ...product('monitor'), mode: 'need', maxPrice: 30000 }
  const { ranked } = rank(
    [
      listing('ZSUS 15.6-Inch Portable Monitor Touchscreen', 19187, { rating: 5, reviews: 30, location: 'Overseas', seller: 'Buy More Save More Store' }),
      listing('Dahua LM27-B221B 27 Inch Full HD 100Hz IPS Monitor', 17000, { rating: 4.6, reviews: 12, location: 'Dhaka' }),
    ],
    intent,
  )
  assert.equal(ranked[0].price, 17000)
})

test('"2k" in the needs is a resolution, matched however the title writes it', async () => {
  const i = await buildIntent('monitor', '2k monitor', {})
  assert.deepEqual([i.maxPrice, i.refinedQuery], [null, '2k monitor'])
  const want: Intent = { ...product('monitor'), mode: 'need', mustHave: ['2k resolution'] }
  const { ranked } = rank([listing('Live Tech 17-Inch Square HD LED Monitor', 5550, { highlights: ['High resolution display'] }), listing('ThundeRobot 24.5 inch IPS 1440p 180Hz Monitor', 23900)], want)
  assert.deepEqual(ranked.map((l) => [l.price, l.matchedFeatures]), [[23900, ['2k resolution']], [5550, []]])
})

test('a mouse pad is not a mouse', () => {
  const { ranked } = rank([listing('FANTECH MP353 Gaming Mouse Pad Silk Surface', 870), listing('Attack Shark X11 Wireless Gaming Mouse', 3473)], { ...product('Mouse'), mode: 'need', maxPrice: 5000, mustHave: ['silk'] })
  assert.deepEqual(ranked.map((l) => l.price), [3473])
})

test('rules fallback: "30k" is a budget, "2k monitor" is not', () => {
  assert.equal(parseRules('30k', true).maxPrice, 30000)
  assert.equal(parseRules('2k monitor', true).maxPrice, null)
  assert.equal(parseRules('earbuds 2k', true).maxPrice, 2000)
})

// ---- Cartup ----
// The index is built in Python (agent/cartup_index.py) and read here: the hash
// and the id encoding must agree exactly, or every lookup silently misses.
test('Cartup index: hashing and id encoding match the Python builder', () => {
  assert.deepEqual([fnv1a('kl69'), fnv1a('monitor'), fnv1a('jedel')], [3658253039, 1983775257, 4138264269])
  assert.deepEqual(decodeIds('c,3,p,lfko'), [12, 15, 40, 1000000])
  assert.deepEqual(requiredWords(tokens('sony wh-1000xm5')), ['wh', '1000xm5'])
  assert.deepEqual(requiredWords(tokens('Jedel KL69 61 Keys RGB Mechanical Keyboard')), ['kl69'])
})

test('Cartup product page: price and stock from schema.org, reviews and seller rating from what the page shows', () => {
  // The schema.org block claims 4.9 from 1,375 ratings; the page shows 1 review. The page wins.
  const html = `<html><script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[]}</script>
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Chair Wheel 5Pc","image":["https://imrs.cartup.com/x.webp"],"brand":{"@type":"Brand","name":"Furniture Finds"},"offers":{"@type":"Offer","price":614,"priceCurrency":"BDT","availability":"https://schema.org/InStock","seller":{"@type":"Organization","name":"Furniture Finds"}},"aggregateRating":{"@type":"AggregateRating","ratingValue":"4.9","ratingCount":1375,"bestRating":5}}</script>
  <body><h1>Chair Wheel 5Pc</h1><span>5.0</span> <span>(<!-- -->1<!-- --> reviews)</span> <b>35 %</b> <del>৳950</del> <strong>৳614</strong>
  <p>Furniture Finds <span>88</span> % positive seller rating</p></body></html>`
  const l = parseProductPage(html, 'chair_wheel_5pc_166570935804140_oi44h8')!
  assert.deepEqual(
    [l.site, l.itemId, l.price, l.inStock, l.seller, l.rating, l.reviews, l.originalPrice, l.discountPercent, l.sellerPositive],
    ['cartup', 'cartup:166570935804140', 614, true, 'Furniture Finds', 5, 1, 950, 35, 88],
  )
  const noReviews = parseProductPage(html.replace('(<!-- -->1<!-- --> reviews)', '(<!-- -->0<!-- --> reviews)').replace('<span>5.0</span>', '<span>0.0</span>'), 'x_123456789012_ab')!
  assert.deepEqual([noReviews.rating, noReviews.reviews], [null, 0])
})

test('Cartup category page: its 20 listings, without the unreal ratings', () => {
  const html = `<script type="application/ld+json">{"@type":"ItemList","itemListElement":[{"@type":"ListItem","position":1,"item":{"@type":"Product","name":"Rin Liquid Detergent 800ml","url":"https://cartup.com/product/rin_liquid_detergent_800ml_123456789012_ab12","offers":{"price":177,"availability":"https://schema.org/InStock"},"aggregateRating":{"ratingValue":"4.8","ratingCount":1300}}},{"@type":"ListItem","position":2,"item":{"@type":"Product","name":"Mr. White Detergent Powder 500g","url":"https://cartup.com/product/mr_white_500g_223456789012_cd34","offers":{"price":60,"availability":"https://schema.org/OutOfStock"}}}]}</script>`
  const ls = parseCategoryPage(html)
  assert.deepEqual(ls.map((l) => [l.name, l.price, l.inStock, l.rating, l.reviews]), [['Rin Liquid Detergent 800ml', 177, true, null, 0], ['Mr. White Detergent Powder 500g', 60, false, null, 0]])
})

test('Cartup categories for a kind of item', () => {
  const all = ['baby_detergent', 'detergent', 'mice', 'mousepads', 'monitors_449', 'monitors_499', 'blood_pressure_monitors', 'used_monitors', 'formal_shirts', 'casual_shirts']
  assert.deepEqual(pickCategories(['detergent'], all), ['detergent'])
  assert.deepEqual(pickCategories(['monitor'], all), ['monitors_449', 'monitors_499'])
  assert.deepEqual(pickCategories(['mouse'], all), ['mice'])
  assert.deepEqual(pickCategories(['formal Shirt', 'Shirt'], all), ['formal_shirts'])
  assert.deepEqual(pickCategories(['smartphone'], all), [])
})

test('a Cartup seller rated 90%+ positive counts as trusted, said in those words', () => {
  const l = listing('Pran Miniket Rice 5kg', 445, { site: 'cartup', rating: null, reviews: 0, sellerPositive: 96 })
  assert.equal(standing(l), 'seller rated 96% positive')
  assert.ok(trusted(l))
  assert.match(recommendHere([asResult(l)], product('miniket rice 5kg')).why!, /seller rated 96% positive/)
})

const onCartup = (name: string, price: number, extra: Partial<Listing> = {}) => listing(name, price, { site: 'cartup', ...extra })

test('the same product on Cartup: same model, not a lookalike', () => {
  const found = [onCartup('Jedel KL69 RGB Mechanical Keyboard 61 Keys', 1450, { rating: 4.7, reviews: 20 }), onCartup('Jedel KL68 61 Keys Mechanical Keyboard', 1990)]
  assert.deepEqual(sameProduct(found, KL69).map((l) => l.price), [1450])
  // a Daraz pick's long title still finds Cartup's shorter name for the same item
  const dahua = [onCartup('Dahua LM27-B221B 27 Inch IPS Monitor', 16500, { rating: 4.5, reviews: 8 }), onCartup('Dahua LM24-B201S 24 Inch Monitor', 13000)]
  assert.deepEqual(sameProduct(dahua, 'Dahua LM27-B221B=V1 27 Inch Full HD 100Hz IPS Monitor').map((l) => l.price), [16500])
})

const storeOf = (site: Listing['site'], pick: Listing | null, why = 'Why.'): StoreAnswer => ({
  site, label: site === 'daraz' ? 'Daraz' : 'Cartup', recommended: pick ? asResult(pick) : null, why: pick ? why : null, matches: [], note: null, link: null,
})

test('each store keeps its own pick; where both have the same product, each says how its price compares', () => {
  const stores = [storeOf('daraz', listing('Dahua LM27-B221B=V1 27 Inch Full HD 100Hz IPS Monitor', 17000)), storeOf('cartup', onCartup('Dahua LM27-B221B=V1 27 Inch Full HD 100Hz IPS Monitor', 15591))]
  compareAcross(stores)
  assert.equal(stores[0].recommended?.listing.price, 17000) // nothing is forced across stores
  assert.match(stores[0].why!, /৳1,409 more than on Cartup\.$/)
  assert.match(stores[1].why!, /৳1,409 less than on Daraz\.$/)
  // different products: no comparison is made
  const apart = [storeOf('daraz', listing('Wheel Washing Powder 2Kg', 269)), storeOf('cartup', onCartup('Rin Liquid Detergent 800ml', 177))]
  compareAcross(apart)
  assert.deepEqual(apart.map((s) => s.why), ['Why.', 'Why.'])
})

test('Daraz vouchers never apply to Cartup listings', () => {
  const flat: Voucher = { site: 'daraz', title: 'Daraz Voucher', labels: [], amount: 50, percent: null, maxDiscount: null, minSpend: 399, validFrom: null, validTo: null, sourceUrl: CAMPAIGN }
  assert.equal(checkAll([flat], onCartup('Special Miniket Rice 5Kg', 490), TODAY).length, 0)
  assert.equal(checkAll([flat], listing('Special Miniket Rice 5Kg', 490), TODAY).length, 1)
})

test('Cartup matching: parts aren\'t the phone, a different rice isn\'t "miniket rice 5kg"', () => {
  assert.deepEqual(sameProduct([onCartup('Samsung Galaxy A36 Full Body Housing Middle Frame Chassis', 1236)], 'Samsung Galaxy A36'), [])
  const rice = [onCartup('Pran Miniket Rice 5kg', 445), onCartup('Teer Shampakatari Nazirshail Rice - 5kg', 458)]
  assert.deepEqual(sameProduct(rice, 'miniket rice 5kg').map((l) => l.price), [445])
  // a different bottle size is a different product
  assert.deepEqual(sameProduct([onCartup('Parachute Naturale Shampoo Damage Repair 160ml', 93)], 'Parachute Naturale Damage Repair Shampoo with Red Hibiscus 170ml'), [])
  // "track on glass" is a mouse feature, not a screen protector
  const mx = [onCartup('Logitech MX Master 3S - Wireless Performance Mouse with Ultra-fast Scrolling, Track on Glass', 14500)]
  assert.equal(sameProduct(mx, 'MX MASTER 3S High-performance Wireless Mouse').length, 1)
})

test('variant words count right after the model code, not deep in a description', () => {
  assert.equal(variantsOf('Xiaomi Redmi Note 14 Pro Plus 5g', 'note14'), 'plus pro')
  assert.equal(variantsOf('Logitech MX Master 3S Wireless Mouse with Ultra-fast Scrolling', '3s'), '')
  assert.equal(variantsOf('Samsung Galaxy S24 Ultra 12/256GB', 's24'), 'ultra')
})

test('"Logitech MX Master 3S" is not the MX Anywhere 3S, on either store', () => {
  const daraz = [listing('Logitech MX Master 3S with Free Adobe Subscription Wireless Mouse', 11999, { officialStore: true }), listing('Logitech MX Anywhere 3S Compact Wireless Mouse', 8275, { officialStore: true })]
  assert.deepEqual(rank(daraz, product('Logitech MX Master 3S')).ranked.map((l) => l.price), [11999])
  assert.deepEqual(sameProduct([onCartup('Buy Logitech MX Anywhere 3S & Get Backpack', 8580)], 'Logitech MX Master 3S'), [])
})

test('a product name with a number in its code gets no budget', async () => {
  assert.equal((await buildIntent('sony wh-1000xm5', '', {})).maxPrice, null)
  assert.equal((await buildIntent('Walton 1.5 ton AC', '', {})).maxPrice, null)
  assert.equal((await buildIntent('monitor', '30k', {})).maxPrice, 30000)
})

test('recommended here: measured against the trusted offers, not an odd closest-titled one', () => {
  // Today's closest-titled KL69 listing was an unrated ৳2,500 one.
  const daraz = [listing('Jedel Kl 69 keys 61 Rgb Mechanical keyboard', 2500, { rating: null, reviews: 0 }), listing('Jedel KL69 OEM Mechanical 61 Keys Keyboard', 1428, { officialStore: true }), listing('Jedel KL69 OEM 61 Keys Keyboard', 1300, { rating: null, reviews: 0 })].map(asResult)
  const { pick, why } = recommendHere(daraz, product(KL69))
  assert.equal(pick?.listing.price, 1428)
  assert.match(why!, /from a seller worth trusting \(Daraz Mall\)\. 1 cheaper listing from sellers without ratings is below\./)
})

test('"best 5G phone under ৳30,000": 5G is the network; no accessory or look-alike category for phones', async () => {
  assert.deepEqual([...quantities('Samsung Galaxy A36 5G 8/128GB')], [])
  assert.deepEqual([...quantities('Sugar 500g')], ['500g'])
  const ai = { AI: { run: async () => ({ response: { search_query: 'smartphone', brand: null, min_price: null, max_price: 30000, must_have: ['5G'], product_type: 'smartphone' } }) } }
  const i = await buildIntent('', 'best 5G phone under 30000', ai)
  assert.deepEqual([i.mode, i.maxPrice, i.mustHave], ['need', 30000, ['5G']])
  // Cartup's "mobiles" is crib toys and it barely sells phones: no category beats a wrong one.
  const all = ['smartphone_lenses', 'feature_phones', 'mobiles_158', 'phone_cases', 'mobile_accessories']
  assert.deepEqual(pickCategories(['smartphone'], all), [])
  assert.deepEqual(pickCategories(['feature phone'], all), ['feature_phones'])
  assert.deepEqual(pickCategories(['phone case'], all), ['phone_cases'])
})

test('two Cartup categories with the same name: keep the one that looks like what Daraz found', () => {
  const pc = [onCartup('Dahua LM27-B221B 27 Inch Full HD 100Hz IPS Monitor', 15591), onCartup('PC Power 23.8 Inch FHD IPS Monitor', 16500)]
  const medical = [onCartup('Doppler Fetal Rate Monitor Baby Fetal Sound Heart Detector', 1522), onCartup('Fetal Doppler Heart Rate Monitor', 1568)]
  const browsed = { categories: ['monitors_449', 'monitors_499'], byCategory: { monitors_449: medical, monitors_499: pc }, listings: [...medical, ...pc] }
  const daraz = ['Dahua LM27-B221B=V1 27 Inch Full HD 100Hz IPS Monitor', 'Live Tech 17-Inch Square Hd Led Monitor', 'PC Power PCM24FRX 23.8 Inch FHD 120Hz IPS Monitor']
  const kept = likeDaraz(browsed, daraz, ['monitor'])
  assert.deepEqual(kept.categories, ['monitors_499'])
  assert.deepEqual(kept.listings.map((l) => l.price), [15591, 16500])
})

test('a listing with a couple of reviews says so, not "no ratings yet"', () => {
  assert.equal(evidence(listing('MX Master 3S', 15000, { rating: 5, reviews: 2 })), '★ 5.0 from 2 reviews')
  assert.equal(evidence(listing('x', 1, { rating: null, reviews: 0, sellerPositive: 94 })), 'seller rated 94% positive')
  assert.equal(evidence(listing('x', 1, { rating: null, reviews: 0 })), 'no ratings yet')
})

test('words as sellers type them: a letter off at the end, or two words run together', () => {
  const want = tokens('Air Jordan waterproof Crossbody Chest/Waist Bag')
  assert.deepEqual(foundWords(want, 'Air Jordan waterproofe Crossbody Chestwaist Bag'), want)
  // Model codes stay exact: a KL699 is not a KL69.
  assert.deepEqual(foundWords(['kl69'], 'Jedel KL699 Keyboard'), [])
})

test('a renamed Cartup listing is found under the name its search still shows', () => {
  const html = `<html><head><title>Air Jordan waterproofe Crossbody Chest/Waist Bag</title>
  <meta property="og:title" content="Air Jordan waterproofe Crossbody Chest/Waist Bag "/></head>
  <script type="application/ld+json">{"@type":"Product","name":"Jordan Luxurious Professional Waterproof Trendy Side Bag","offers":{"price":369,"availability":"https://schema.org/InStock","seller":{"name":"Picks"}}}</script>
  <body><h1>Jordan Luxurious Professional Waterproof Trendy Side Bag</h1> 0.0 ( 0 reviews)</body></html>`
  const bag = parseProductPage(html, 'air_jordan_waterproofe_crossbody_chestwaist_bag_1266170223066047_8j1h13')!
  assert.equal(bag.alsoNamed, 'Air Jordan waterproofe Crossbody Chest/Waist Bag')
  const name = 'Air Jordan waterproof Crossbody Chest/Waist Bag'
  assert.deepEqual(sameProduct([bag], name).map((l) => l.price), [369])
  // A short name inside the typed one is a close match, not the product.
  const relate = relations(name)
  assert.equal(relate(onCartup('Jordan Chest Bag', 1290)), 'close')
  assert.equal(relate(onCartup('Bacbaas Crossbody Waist Belt Bag Unisex Chest Sling Bag', 573)), null)
  // Generic bags with the same generic words aren't close: the make is missing.
  assert.equal(relate(listing("Women's Waist Bag Oxford Cloth Waterproof Belt Bag Crossbody Chest Bag", 765)), null)
  assert.equal(relate(listing('Air Jordan Cross Body Bag', 1200)), 'close')
})

test('how a listing relates to the product: same, another size or variant, close, or not at all', () => {
  const rice = relations('miniket rice 5kg')
  assert.deepEqual(
    [
      listing('Pran Miniket Rice 5kg', 445),
      listing('Pran Miniket Rice 25kg', 2100),
      listing('Khan Rice Miniket premium 2 KG Packet', 175),
      listing('Teer Nazirshail Rice 5kg', 480),
      listing('Pran Miniket Rice 5kg', 445, { inStock: false }),
    ].map(rice),
    ['same', 'variant', 'variant', null, null],
  )
  const mx = relations('Logitech MX Master 3S')
  assert.deepEqual(
    [listing('Logitech MX Master 3S Wireless Mouse', 15000), listing('Logitech MX Master 3 Wireless Mouse', 9000), listing('Logitech M170 Wireless Mouse', 950), listing('Mouse pad for Logitech MX Master 3S', 300)].map(mx),
    ['same', 'close', null, null],
  )
  assert.equal(relations('iPhone 15 128GB')(listing('Apple iPhone 15 Pro 128GB', 150000)), 'variant')
  // With a model code, close means a sibling model.
  const sony = relations('Sony WH-1000XM5')
  assert.deepEqual([listing('Sony WH-1000XM4 Wireless Headphones', 25000), listing('Sony WF-1000XM5 Wireless Earbuds', 27000)].map(sony), ['close', null])
  const a36 = relations('Samsung Galaxy A36')
  assert.deepEqual(
    [listing('Samsung Galaxy A26 5G 8/128GB', 36999), listing('Samsung Galaxy A37 5G', 43499), listing('Samsung Galaxy A07 4/64GB', 20499), listing('Samsung Galaxy F13 4G 4/64GB', 20001)].map(a36),
    ['close', 'close', null, null],
  )
})

test('"More on a store": the product\'s other sellers, then its other sizes, then close matches — nothing unrelated', () => {
  const intent = product('miniket rice 5kg')
  const pran = listing('Pran Miniket Rice 5kg', 445)
  const aci = listing('ACI Miniket Rice 5kg', 470)
  const pool = [
    pran, aci,
    listing('Pran Miniket Rice 25kg', 2100),
    listing('Pran Miniket Rice 2kg', 190),
    listing('Miniket Rice Premium 10kg Bag', 900),
    listing('Chinigura Aromatic Rice 1kg', 160),
    listing('Rice Cooker 1.8L', 2400),
  ]
  const rows = matchRows({ intent, title: intent.searchQuery, ref: pran, same: [pran, aci], pool })
  assert.deepEqual(rows.map((r) => [r.listing.name, r.label]), [
    ['Pran Miniket Rice 5kg', 'Same product'],
    ['ACI Miniket Rice 5kg', 'Same product'],
    ['Pran Miniket Rice 2kg', 'Other size or variant'],
    ['Miniket Rice Premium 10kg Bag', 'Other size or variant'],
    ['Pran Miniket Rice 25kg', 'Other size or variant'],
  ])
  // A "same product" rank set aside (priced like a copy) doesn't come back through the pool.
  const copy = listing('Pran Miniket Rice 5kg', 90)
  assert.ok(!matchRows({ intent, title: intent.searchQuery, ref: pran, same: [pran], pool: [...pool, copy] }).some((r) => r.listing === copy))
})

test('"Also worth a look" for a kind of item: the pick\'s other sellers and the other store\'s pick first, then other fits', () => {
  const intent: Intent = { ...product('mouse'), mode: 'need', maxPrice: 30000 }
  const pick = onCartup('Logitech MX Master 3S Wireless Mouse', 12320)
  const otherSeller = onCartup('Logitech MX Master 3S Performance Wireless Mouse', 12900)
  const darazPick = listing('Logitech MX Anywhere 3S Compact Wireless Mouse', 9500)
  const anywhere = onCartup('Logitech MX Anywhere 3S Compact Wireless Mouse', 9200)
  const fit = onCartup('Razer DeathAdder V3 Gaming Mouse', 8000)
  const office = onCartup('A4tech OP-720 Wired Mouse', 300)
  const rows = matchRows({ intent, title: pick.name, ref: pick, same: [], pool: [pick, otherSeller, anywhere, fit, office], otherPick: { label: 'Daraz', listing: darazPick }, fits: [fit] })
  assert.deepEqual(rows.filter((r) => r.listing !== pick).map((r) => [r.listing.name, r.label]), [
    ['Logitech MX Master 3S Performance Wireless Mouse', 'Same product, another seller'],
    ['Logitech MX Anywhere 3S Compact Wireless Mouse', "Same as Daraz's pick"],
    ['Razer DeathAdder V3 Gaming Mouse', 'Also fits'],
  ])
})

test('a lone Cartup category with nothing in common with what Daraz found is left out', () => {
  const eggs = [onCartup('Egg Master Electric Egg Roll Maker with Timer', 1450), onCartup('Egg Master Automatic Rising Egg Cooker', 1290)]
  const browsed = { categories: ['egg_master'], byCategory: { egg_master: eggs }, listings: eggs }
  const daraz = ['Logitech MX Master 3S Graphite Bluetooth Mouse', 'Logitech MX Master 3S with Free Adobe Subscription - Wireless Performance Mouse']
  assert.deepEqual(likeDaraz(browsed, daraz, ['master']).categories, [])
  const mice = [onCartup('Logitech M331 Silent Wireless Mouse', 1450), onCartup('Logitech MX Anywhere 3S Wireless Mouse', 8580)]
  const browsedMice = { categories: ['mice'], byCategory: { mice }, listings: mice }
  assert.deepEqual(likeDaraz(browsedMice, daraz, ['mouse']).categories, ['mice'])
})

test('mouse + 30k: the best-fit product is recommended at its best trusted offer, and ৳260 mice aren\'t "worth a look" next to it', () => {
  const asResult = (l: Listing): Result => ({ listing: l, history: null, vouchers: [], bestVoucher: null, finalPrice: l.price, hints: [] })
  const fit = asResult(listing('MX MASTER 3S High-performance Wireless Mouse', 15000, { rating: 5, reviews: 2 }))
  const mall = asResult(listing('Logitech MX Master 3S with Free Adobe Subscription', 11999, { officialStore: true }))
  const unrated = asResult(listing('Logitech MX Master 3S Wireless Mouse', 9000, { rating: null, reviews: 0 }))
  assert.equal(bestOffer(fit, [fit, mall, unrated]), mall)
  assert.equal(bestOffer(fit, [fit, unrated]), fit)

  const intent: Intent = { ...product('mouse'), mode: 'need', maxPrice: 30000 }
  const pick = onCartup('Logitech MX Master 3S with Free Adobe Subscription', 12320)
  const cheap = onCartup('HP 2.4G Wireless Optical Mouse', 260)
  const rows = matchRows({ intent, title: pick.name, ref: pick, same: [], pool: [pick, cheap], fits: [cheap] })
  assert.ok(!rows.some((r) => r.listing === cheap))
})

test('"lotion": a bundle with a 100ml wash is not the 100ml lotion, and a gift box is not another size of it', () => {
  const pick = 'Parachute Just for Baby - Baby Lotion 100ml'
  const relate = relations(pick)
  assert.deepEqual(
    [
      listing('Parachute Just for Baby - Baby Lotion 100ml', 175),
      listing('Parachute Just for Baby - Baby Lotion 200ml & Baby Wash 100ml', 453),
      listing('Parachute Just for Baby - Baby Lotion 200ml (Baby Face Cream 50g FREE)', 364),
      listing('Parachute Just for Baby - Baby Gift Box 450ml (Powder + Oil + Lotion + Wash + Face Cream)', 600),
      listing('Parachute Just for Baby - Baby Gift 450ml (Powder + Oil + Lotion + Wash + Face Cream)', 900),
      // Another product in the same line: "Milky Glow" sits between its words.
      listing('Parachute Just For Baby - Milky Glow Lotion 100ml', 158),
      // Same brand line, another kind of thing: not even close.
      listing('Parachute Just for Baby - Baby Shampoo 100ml', 180),
    ].map(relate),
    ['same', null, 'variant', null, null, 'variant', null],
  )
  // "Care" is filler: the same Aveeno lotion.
  assert.equal(relations('Aveeno Baby Daily Moisturising Lotion 150ml')(onCartup('Aveeno Baby Daily Care Baby Moisturising Lotion - 150ml', 1344)), 'same')
  // Nor is a gift box one of the other lotions worth a look.
  const need: Intent = { ...product('lotion'), mode: 'need' }
  const giftBox = onCartup('Parachute Just for Baby – Baby Gift Box 450ml (Powder + Oil + Lotion + Wash + Face Cream)', 720)
  const johnsons = onCartup('Johnsons Baby Lotion 100 ml', 280)
  const lotion200 = onCartup('Parachute Just for Baby - Baby Lotion 200ml', 269)
  assert.deepEqual(matchRows({ intent: need, title: lotion200.name, ref: lotion200, same: [], pool: [lotion200], fits: [giftBox, johnsons] }).filter((r) => r.relation === 'fits').map((r) => r.listing), [johnsons])
  // A brand or sales talk around the name doesn't make it another product.
  const rice = relations('miniket rice 5kg')
  assert.deepEqual([listing('Pran Premium Miniket Rice 5kg', 450), listing('Miniket Atab Rice 5kg', 460)].map(rice), ['same', 'variant'])
  // Named on its own, the 100ml lotion: the bundle is not one of its sellers.
  const { ranked } = rank(
    [listing(pick, 163, { officialStore: true }), listing('Parachute Just for Baby - Baby Lotion 200ml & Baby Wash 100ml', 453)],
    product(pick),
    6,
  )
  assert.deepEqual(ranked.map((l) => l.price), [163])
})

test("a renamed listing's generic earlier name doesn't make a different scent the same product", () => {
  const relate = relations('Kodomo_Baby Lotion Powder Pink Hanabaki - 180ml (Thailand)')
  const extraMild = onCartup('Kodomo Baby Lotion Powder (Extra Mild) - 180ml', 847, { alsoNamed: 'Kodomo Baby Lotion Powder 180ml (Thailand)' })
  assert.notEqual(relate(extraMild), 'same')
  assert.equal(relate(onCartup('Kodomo Baby Lotion Powder (Pink Hanabaki) 180ml', 744)), 'same')
})

test('"lotion": a pick the other store sells too goes on both cards; of two such picks, the one more buyers reviewed', () => {
  const parachute = listing('Parachute Just for Baby - Baby Lotion 100ml', 163, { officialStore: true, reviews: 1273 })
  const onCartupToo = onCartup('Parachute Just for Baby - Baby Lotion 100ml', 198)
  const dNee = onCartup('D Nee Organic Baby Lotion Sakura For Newborn 300ml', 1499, { reviews: 0, sellerPositive: 90 })
  assert.equal(sharedPick({ pick: parachute, elsewhere: [onCartupToo] }, { pick: dNee, elsewhere: [] }), 'a')
  assert.equal(sharedPick({ pick: dNee, elsewhere: [] }, { pick: parachute, elsewhere: [onCartupToo] }), 'b')
  // "baby lotion": each store sells the other's pick; the 100ml has the reviews.
  const lotion200 = onCartup('Parachute Just for Baby - Baby Lotion 200ml', 269, { reviews: 44 })
  const lotion200OnDaraz = listing('Parachute Just for Baby - Baby Lotion 200ml', 364, { reviews: 60 })
  assert.equal(sharedPick({ pick: parachute, elsewhere: [onCartupToo] }, { pick: lotion200, elsewhere: [lotion200OnDaraz] }), 'a')
  assert.equal(sharedPick({ pick: parachute, elsewhere: [] }, { pick: dNee, elsewhere: [] }), null)
})

test('a kind of item with a brand: the brand typed is the brand picked', () => {
  const need = (q: string): Intent => ({ ...product(q), mode: 'need' })
  const pool = [
    listing('Cold pressed mustard oil Ghani 1 litre', 220, { reviews: 900, rating: 4.9 }),
    listing('Radhuni Pure Mustard Oil 1 Litre', 330, { reviews: 40 }),
    listing('Radhuni Turmeric Powder 200gm', 120, { reviews: 500 }),
  ]
  assert.equal(rank(pool, need('radhuni mustard oil')).ranked[0].name, 'Radhuni Pure Mustard Oil 1 Litre')
  const shoes = [listing("New Men's Sport Sneakers", 1162, { reviews: 300 }), listing("Lotto Men's Running Shoes", 2400, { reviews: 12 })]
  assert.equal(rank(shoes, need('lotto')).ranked[0].name, "Lotto Men's Running Shoes")
  // Daraz has no Radhuni mustard oil: the pick says so.
  assert.deepEqual(missingWords('radhuni mustard oil', 'Cold pressed mustard oil Ghani 500 ml'), ['radhuni'])
  // A bundle isn't one of it.
  assert.equal(rank([listing('Lux Body Wash 245ml (Bundle of 4)', 645, { reviews: 300 }), listing('Lux Body Wash 245ml', 162)], need('lux body wash')).ranked[0].price, 162)
  // Plurals count: "bag" is in "Bags".
  assert.equal(rank([listing('Ladies Bags Leather', 900), listing('Wallet Leather', 500, { reviews: 400 })], need('bag')).ranked[0].name, 'Ladies Bags Leather')
})

test('buy one get one free is two of it, not another seller of one', () => {
  assert.ok(isBundle('[BUY 1 GET 1 Free] Himalaya Clear Complexion Brightening Body Lotion 400ml'))
  assert.ok(!isBundle('Himalaya Clear Complexion Brightening Body Lotion 400ml'))
})

test('a number before a unit is a size, not a model code: another brand\'s 1 Ltr oil is not the same product', () => {
  assert.deepEqual(modelTokens(tokens('Radhuni Mustard Oil - 1 Ltr')), [])
  assert.deepEqual(modelTokens(tokens('miniket rice 5 kg')), [])
  assert.deepEqual(modelTokens(tokens('iphone 15')), ['iphone15'])
  const relate = relations('Radhuni Mustard Oil - 1 Ltr')
  assert.deepEqual(
    [listing('Organic Mustard Oil- 1 Ltr', 280), listing('Radhuni Mustard Oil 1 Litre', 313), listing('Radhuni Mustard Oil 2 Ltr', 571)].map(relate),
    ['close', 'same', 'variant'],
  )
})

test('a brandless name held in a branded title is not the same product; bulk "buy 10 get 1" deals are bundles', () => {
  const relate = relations('Radhuni Mustard Oil - 1 Ltr')
  assert.notEqual(relate(listing('Mustard Oil1 liter', 271)), 'same')
  assert.ok(isBundle('AMA Sugar Free Coffee 150gm Box (Buy 10 pcs Box Get 1 pcs free)'))
})
