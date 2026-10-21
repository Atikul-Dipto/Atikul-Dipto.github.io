// Offline tests for the Cloudflare port — same cases as ../tests/test_agent.py,
// so the two copies of the rules stay in lockstep. No network, AI or D1.
//   node --test ecommerce-price-tracker/worker/agent.test.ts
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { summarize } from './agent.ts'
import { bestVoucher, campaignName, check, checkAll } from './eligibility.ts'
import { cleanSearchQuery, groundedPrice, parseRules, queryNumbers, restoreModelNumbers } from './intent.ts'
import { quantities, rank } from './ranking.ts'
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
  assert.match(summarize(product('iphone 15'), [], null, 1, 0, 40), /no in-stock listing.*40 results/)
})
