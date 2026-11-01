/**
 * DorAI's compare: one product a shopper is looking at, on every store. Called
 * by the browser extension (from a Daraz or Cartup product page) and the
 * installable web app (a product shared from the Daraz or Cartup app).
 *
 *   GET  ?link=<product URL, or the text an app shares>&name=<the page's product title>
 *   POST { "link": "...", "name": "..." }
 *
 * The comparison itself lives in ecommerce-price-tracker/worker/compare.ts.
 */

import { compare, resolveShared } from '../../../ecommerce-price-tracker/worker/compare.ts'
import { json, preflight } from '../../../ecommerce-price-tracker/worker/http.ts'
import { logAsk } from '../../../ecommerce-price-tracker/worker/store.ts'
import type { Env } from '../../../ecommerce-price-tracker/worker/types.ts'

type Ctx = { request: Request; env: Env; waitUntil(p: Promise<unknown>): void }

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')

async function answer({ request, env, waitUntil }: Ctx, raw: { link?: unknown; name?: unknown }): Promise<Response> {
  const link = clean(raw.link, 600)
  const name = clean(raw.name, 200)
  if (!link) return json(request, { error: 'Share or paste a Daraz or Cartup product link.' }, 400)
  const askedAt = new Date().toISOString()
  const ref = await resolveShared(link)
  if (!ref) return json(request, { error: "That isn't a Daraz or Cartup product link." }, 400)
  const result = await compare(ref, env, { name })
  if (env.PP_DB && !('cached' in result && result.cached)) {
    waitUntil(
      logAsk(env.PP_DB, {
        askedAt,
        query: ref.url,
        mode: 'compare',
        intentSource: '',
        results: 'error' in result ? 0 : result.stores.reduce((n, s) => n + (s.recommended ? 1 : 0) + s.matches.length, 0),
        bestPrice: 'error' in result ? null : result.source.listing.price,
        bestFinal: 'error' in result ? null : result.source.finalPrice,
        voucherApplied: false,
        totalMs: Date.now() - Date.parse(askedAt),
        timings: {},
        error: 'error' in result ? result.error : null,
      }).catch(() => {}),
    )
  }
  return 'error' in result ? json(request, result, 502) : json(request, result)
}

export const onRequestOptions = preflight

export const onRequestGet = (ctx: Ctx) => {
  const params = new URL(ctx.request.url).searchParams
  return answer(ctx, { link: params.get('link'), name: params.get('name') })
}

export const onRequestPost = async (ctx: Ctx) => {
  const body = (await ctx.request.json().catch(() => null)) as { link?: unknown; name?: unknown } | null
  return body ? answer(ctx, body) : json(ctx.request, { error: 'Send JSON: { "link": "..." }' }, 400)
}
