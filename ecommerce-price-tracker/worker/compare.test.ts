// Offline tests for compare.ts — fetch is replaced, so no network, AI or D1.
//   node --test ecommerce-price-tracker/worker/compare.test.ts
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compare, readProductUrl, resolveShared } from './compare.ts'

test('a product address from a page, or inside the text an app shares', () => {
  assert.deepEqual(readProductUrl('https://www.daraz.com.bd/products/hoco-eq34-plus-rima-tws-earbuds-i412345678-s1987654321.html?spm=a2a0e.searchlist'), {
    site: 'daraz',
    itemId: '412345678',
    slug: 'hoco-eq34-plus-rima-tws-earbuds',
    url: 'https://www.daraz.com.bd/products/hoco-eq34-plus-rima-tws-earbuds-i412345678.html',
  })
  assert.equal(readProductUrl('I found this on Cartup! https://www.cartup.com/product/radhuni_mustard_oil_-_1000ml_1334969234769923_dsxi7m')?.itemId, 'cartup:1334969234769923')
  assert.equal(readProductUrl('https://www.daraz.com.bd/catalog/?q=lotion'), null)
})

const darazItem = (itemId: string, name: string, price: number, extra: Record<string, unknown> = {}) => ({
  itemId,
  name,
  price: String(price),
  itemUrl: `//www.daraz.com.bd/products/x-i${itemId}.html`,
  sellerName: `Seller ${itemId}`,
  ratingScore: '4.6',
  review: '40',
  inStock: true,
  ...extra,
})

function withFetch(handler: (url: string) => Response, body: () => Promise<void>) {
  const real = globalThis.fetch
  globalThis.fetch = (async (input: string | URL | Request) => handler(String(input instanceof Request ? input.url : input))) as typeof fetch
  return body().finally(() => (globalThis.fetch = real))
}

test('a Daraz product: its cheaper trusted seller on Daraz is found, and said', () =>
  withFetch(
    (url) =>
      url.includes('daraz.com.bd/catalog')
        ? Response.json({
            mods: {
              listItems: [
                darazItem('111', 'Hoco EQ34 Plus Rima TWS Earbuds', 805, { review: '3' }),
                darazItem('222', 'Hoco EQ34 Plus Rima ANC+ENC TWS Earbuds', 689, { icons: [{ bizType: 'lazMall' }] }),
                darazItem('333', 'Hoco EQ35 TWS Earbuds', 650),
              ],
            },
          })
        : new Response('', { status: 404 }),
    async () => {
      const result = await compare(readProductUrl('https://www.daraz.com.bd/products/hoco-eq34-plus-rima-tws-earbuds-i111.html')!, {})
      assert.ok(!('error' in result))
      assert.equal(result.source.listing.itemId, '111')
      const darazAnswer = result.stores.find((s) => s.site === 'daraz')!
      assert.equal(darazAnswer.recommended?.listing.itemId, '222')
      assert.deepEqual(result.cheaper, { site: 'daraz', label: 'Daraz', saving: 116 })
      // The sibling model is only a close match, never the same product.
      assert.equal(darazAnswer.matches.find((m) => m.listing.itemId === '333')?.relation, 'close')
    },
  ))

test('a Daraz bot check: an honest error, not a guess', () =>
  withFetch(
    () => new Response('<script>sec</script>', { status: 200 }),
    async () => {
      const result = await compare(readProductUrl('https://www.daraz.com.bd/products/x-i111.html')!, {})
      assert.deepEqual(result, { error: "Couldn't reach Daraz just now — try again in a moment." })
    },
  ))

test('a short link shared from the Daraz app is followed to the product', () =>
  withFetch(
    (url) =>
      url.startsWith('https://s.daraz.com.bd/')
        ? new Response(null, { status: 302, headers: { location: 'https://www.daraz.com.bd/products/hoco-eq34-plus-i111-s222.html?from=share' } })
        : new Response('', { status: 404 }),
    async () => {
      const ref = await resolveShared('Check out Hoco EQ34 Plus on Daraz! https://s.daraz.com.bd/s.ZEAe')
      assert.equal(ref?.itemId, '111')
      assert.equal(await resolveShared('https://example.com/s.ZEAe'), null)
    },
  ))

test("a shared Daraz link with no title is searched by the page's own title", () =>
  withFetch(
    (url) => {
      if (url.includes('/products/')) {
        const ld = { '@type': 'Product', name: 'Hoco EQ34 Plus Rima ANC+ENC TWS Earbuds - Bluetooth 5.4' }
        return new Response(`<html><script type="application/ld+json">${JSON.stringify(ld)}</script></html>`)
      }
      // Daraz's search only shows the listing for its real title, not the address's words.
      const q = new URL(url).searchParams.get('q') ?? ''
      return Response.json({ mods: { listItems: q.includes('Bluetooth') ? [darazItem('111', 'Hoco EQ34 Plus Rima ANC+ENC TWS Earbuds - Bluetooth 5.4', 1117)] : [] } })
    },
    async () => {
      const result = await compare(readProductUrl('https://www.daraz.com.bd/products/hoco-eq34-plus-rima-anc-enc-tws-54-i111.html')!, {})
      assert.ok(!('error' in result))
      assert.equal(result.source.listing.price, 1117)
    },
  ))

test('a Cartup product while Daraz refuses: Daraz is marked unchecked, so nothing is claimed about it', () =>
  withFetch(
    (url) => {
      if (url.includes('cartup.com/product/')) {
        const ld = { '@type': 'Product', name: 'Rin Liquid Detergent 800ml', offers: { price: 177, availability: 'https://schema.org/InStock', seller: { name: 'Unilever' } } }
        return new Response(`<html><script type="application/ld+json">${JSON.stringify(ld)}</script></html>`)
      }
      return new Response('<script>sec</script>', { status: 200 })
    },
    async () => {
      const result = await compare(readProductUrl('https://cartup.com/product/rin_liquid_detergent_800ml_1234567890123_abc123')!, {})
      assert.ok(!('error' in result))
      assert.deepEqual(result.unreachable, ['daraz'])
      assert.equal(result.cheaper, null)
    },
  ))
