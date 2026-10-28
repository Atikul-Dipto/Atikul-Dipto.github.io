// Offline tests for the Cloudflare port — same cases as ../tests/test_agent.py,
// so the two copies of the rules stay in lockstep. No network, AI or D1.
//   node --test ecommerce-price-tracker/worker/agent.test.ts
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { cheaperElsewhere, chooseBest, type Result, sameOnCartup, summarize } from './agent.ts'
import { decodeIds, fnv1a, parseProductPage, requiredWords } from './cartup.ts'
import { bestVoucher, campaignName, check, checkAll } from './eligibility.ts'
import { buildIntent, cleanSearchQuery, coreQuery, describeQuery, groundedPrice, namesAProduct, parseRules, queryNumbers, restoreModelNumbers } from './intent.ts'
import { modelTokens, quantities, rank, storageOf, tokens, variantsOf } from './ranking.ts'
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

test('empty answer explains itself', () => {
  assert.match(summarize(product('iphone 15'), [], [], null, 1, 0, 40), /no in-stock listing.*40 results/)
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

test('best choice: a ৳5 saving is not worth switching away from the named listing', () => {
  const { ranked, alternatives } = rank(kl69Listings(), product(KL69))
  const choice = chooseBest(ranked.map(asResult), alternatives.map(asResult), product(KL69))
  assert.equal(choice?.kind, 'exact')
})

test('best choice: the same product meaningfully cheaper from a trusted seller', () => {
  const items = [listing(KL69, 1530, { rating: 4.8, reviews: 39 }), listing('Jedel KL69 OEM 61 Keys Keyboard', 1400, { rating: 4.5, reviews: 12 }), listing('Jedel KL69 Keyboard', 1300, { rating: null, reviews: 0 })]
  const { ranked } = rank(items, product(KL69))
  const choice = chooseBest(ranked.map(asResult), [], product(KL69))
  assert.equal(choice?.kind, 'same')
  assert.equal(ranked[choice!.index].price, 1400) // the unrated ৳1,300 seller isn't recommended
})

test('best choice: when the named one is over budget, something that fits', () => {
  const wishes: Intent = { ...product(KL69), maxPrice: 1400 }
  const { ranked, alternatives } = rank(kl69Listings(), wishes)
  assert.equal(ranked[0].name, KL69) // still shown first, even over budget
  const choice = chooseBest(ranked.map(asResult), alternatives.map(asResult), wishes)
  assert.equal(choice?.kind, 'alternative')
  assert.ok(alternatives[choice!.index].price <= 1400)
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
  const items = [listing('Xiaomi Redmi Note 14 5G (8+256GB)', 29999, { rating: 5, reviews: 4 }), listing('Xiaomi Redmi Note 14 5G (8+128GB)', 26999, { officialStore: true })]
  const { ranked } = rank(items, product('Xiaomi Redmi Note 14'))
  assert.equal(chooseBest(ranked.map(asResult), [], product('Xiaomi Redmi Note 14'))?.kind, 'exact')
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

test('Cartup product page: live price, stock, seller and rating from its schema.org data', () => {
  const html = `<html><script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[]}</script>
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Chair Wheel 5Pc","image":["https://imrs.cartup.com/x.webp"],"brand":{"@type":"Brand","name":"Furniture Finds"},"offers":{"@type":"Offer","price":614,"priceCurrency":"BDT","availability":"https://schema.org/InStock","seller":{"@type":"Organization","name":"Furniture Finds"}},"aggregateRating":{"@type":"AggregateRating","ratingValue":"4.9","ratingCount":1375,"bestRating":5}}</script></html>`
  const l = parseProductPage(html, 'chair_wheel_5pc_166570935804140_oi44h8')!
  assert.deepEqual(
    [l.site, l.itemId, l.price, l.inStock, l.seller, l.rating, l.reviews, l.url],
    ['cartup', 'cartup:166570935804140', 614, true, 'Furniture Finds', 4.9, 1375, 'https://www.cartup.com/product/chair_wheel_5pc_166570935804140_oi44h8'],
  )
})

const onCartup = (name: string, price: number, extra: Partial<Listing> = {}) => listing(name, price, { site: 'cartup', ...extra })

test('the same product on Cartup: same model, not a lookalike', () => {
  const found = [onCartup('Jedel KL69 RGB Mechanical Keyboard 61 Keys', 1450, { rating: 4.7, reviews: 20 }), onCartup('Jedel KL68 61 Keys Mechanical Keyboard', 1990)]
  assert.deepEqual(sameOnCartup(found, KL69).map((l) => l.price), [1450])
  // a Daraz pick's long title still finds Cartup's shorter name for the same item
  const dahua = [onCartup('Dahua LM27-B221B 27 Inch IPS Monitor', 16500, { rating: 4.5, reviews: 8 }), onCartup('Dahua LM24-B201S 24 Inch Monitor', 13000)]
  assert.deepEqual(sameOnCartup(dahua, 'Dahua LM27-B221B=V1 27 Inch Full HD 100Hz IPS Monitor').map((l) => l.price), [16500])
})

test('best choice can be the same product on Cartup, by the same rules as another Daraz seller', () => {
  const daraz = rank([listing(KL69, 1530, { rating: 4.8, reviews: 39 })], product(KL69)).ranked.map(asResult)
  const cheaperTrusted = [onCartup('Jedel KL69 61 Keys RGB Mechanical Keyboard', 1400, { rating: 4.7, reviews: 20 })].map(asResult)
  const cheaperUnrated = [onCartup('Jedel KL69 61 Keys RGB Mechanical Keyboard', 1300, { rating: null, reviews: 0 })].map(asResult)
  assert.equal(chooseBest(daraz, [], product(KL69), cheaperTrusted)?.kind, 'other_store')
  assert.equal(chooseBest(daraz, [], product(KL69), cheaperUnrated)?.kind, 'exact')
  assert.equal(chooseBest([], [], product(KL69), cheaperTrusted)?.kind, 'other_store') // not in stock on Daraz
})

test('Daraz vouchers never apply to Cartup listings', () => {
  const flat: Voucher = { site: 'daraz', title: 'Daraz Voucher', labels: [], amount: 50, percent: null, maxDiscount: null, minSpend: 399, validFrom: null, validTo: null, sourceUrl: CAMPAIGN }
  assert.equal(checkAll([flat], onCartup('Special Miniket Rice 5Kg', 490), TODAY).length, 0)
  assert.equal(checkAll([flat], listing('Special Miniket Rice 5Kg', 490), TODAY).length, 1)
})

test('Cartup matching: parts aren\'t the phone, a different rice isn\'t "miniket rice 5kg"', () => {
  assert.deepEqual(sameOnCartup([onCartup('Samsung Galaxy A36 Full Body Housing Middle Frame Chassis', 1236)], 'Samsung Galaxy A36'), [])
  const rice = [onCartup('Pran Miniket Rice 5kg', 445), onCartup('Teer Shampakatari Nazirshail Rice - 5kg', 458)]
  assert.deepEqual(sameOnCartup(rice, 'miniket rice 5kg').map((l) => l.price), [445])
  // a different bottle size is a different product
  assert.deepEqual(sameOnCartup([onCartup('Parachute Naturale Shampoo Damage Repair 160ml', 93)], 'Parachute Naturale Damage Repair Shampoo with Red Hibiscus 170ml'), [])
  // "track on glass" is a mouse feature, not a screen protector
  const mx = [onCartup('Logitech MX Master 3S - Wireless Performance Mouse with Ultra-fast Scrolling, Track on Glass', 14500)]
  assert.equal(sameOnCartup(mx, 'MX MASTER 3S High-performance Wireless Mouse').length, 1)
})

test('variant words count right after the model code, not deep in a description', () => {
  assert.equal(variantsOf('Xiaomi Redmi Note 14 Pro Plus 5g', 'note14'), 'plus pro')
  assert.equal(variantsOf('Logitech MX Master 3S Wireless Mouse with Ultra-fast Scrolling', '3s'), '')
  assert.equal(variantsOf('Samsung Galaxy S24 Ultra 12/256GB', 's24'), 'ultra')
})

test('"Logitech MX Master 3S" is not the MX Anywhere 3S, on either store', () => {
  const daraz = [listing('Logitech MX Master 3S with Free Adobe Subscription Wireless Mouse', 11999, { officialStore: true }), listing('Logitech MX Anywhere 3S Compact Wireless Mouse', 8275, { officialStore: true })]
  assert.deepEqual(rank(daraz, product('Logitech MX Master 3S')).ranked.map((l) => l.price), [11999])
  assert.deepEqual(sameOnCartup([onCartup('Buy Logitech MX Anywhere 3S & Get Backpack', 8580)], 'Logitech MX Master 3S'), [])
})

test('a kind-of-item pick that is cheaper on Cartup becomes the best choice', () => {
  const pick = asResult(listing('Dahua LM27-B221B=V1 27 Inch Full HD 100Hz IPS Monitor', 17000))
  const cartup = [asResult(onCartup('Dahua LM27-B221B=V1 27 Inch Full HD 100Hz IPS Monitor', 15591, { rating: 4.6, reviews: 1091 }))]
  assert.equal(cheaperElsewhere(pick, cartup)?.kind, 'other_store')
  assert.match(cheaperElsewhere(pick, cartup)!.reason, /৳1,409 less/)
})

test('a product name with a number in its code gets no budget', async () => {
  assert.equal((await buildIntent('sony wh-1000xm5', '', {})).maxPrice, null)
  assert.equal((await buildIntent('Walton 1.5 ton AC', '', {})).maxPrice, null)
  assert.equal((await buildIntent('monitor', '30k', {})).maxPrice, 30000)
})
