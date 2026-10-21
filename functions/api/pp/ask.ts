/**
 * Price Pulse's shopping agent: /api/pp/ask on the Cloudflare copy of the
 * site, called from both copies of /price-pulse/. The agent itself lives with
 * the rest of Price Pulse in ecommerce-price-tracker/worker/.
 *
 *   GET  ?q=<what the shopper typed>
 *   POST { "query": "..." }
 */

import { run } from '../../../ecommerce-price-tracker/worker/agent.ts'
import { json, preflight } from '../../../ecommerce-price-tracker/worker/http.ts'
import { logAsk } from '../../../ecommerce-price-tracker/worker/store.ts'
import type { Env } from '../../../ecommerce-price-tracker/worker/types.ts'

type Ctx = { request: Request; env: Env; waitUntil(p: Promise<unknown>): void }

async function answer({ request, env, waitUntil }: Ctx, raw: unknown): Promise<Response> {
  const query = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : ''
  if (query.length < 2 || query.length > 200) return json(request, { error: 'Ask for a product in 2 to 200 characters.' }, 400)

  const askedAt = new Date().toISOString()
  try {
    const result = await run(query, env)
    const best = result.bestIndex !== null ? result.results[result.bestIndex] : null
    if (env.PP_DB) {
      waitUntil(
        logAsk(env.PP_DB, {
          askedAt,
          query,
          mode: result.intent.mode,
          intentSource: result.intent.source,
          results: result.results.length,
          bestPrice: best?.listing.price ?? null,
          bestFinal: best?.finalPrice ?? null,
          voucherApplied: Boolean(best?.bestVoucher),
          totalMs: result.timingsMs.total,
          timings: result.timingsMs,
          error: null,
        }).catch(() => {}),
      )
    }
    return json(request, result)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (env.PP_DB) {
      waitUntil(
        logAsk(env.PP_DB, { askedAt, query, mode: '', intentSource: '', results: 0, bestPrice: null, bestFinal: null, voucherApplied: false, totalMs: Date.now() - Date.parse(askedAt), timings: {}, error: message.slice(0, 300) }).catch(() => {}),
      )
    }
    return json(request, { error: `Couldn't reach Daraz just now (${message}). Try again in a moment.` }, 502)
  }
}

export const onRequestGet = (ctx: Ctx) => answer(ctx, new URL(ctx.request.url).searchParams.get('q'))

export const onRequestPost = async (ctx: Ctx) => {
  const body = (await ctx.request.json().catch(() => null)) as { query?: unknown } | null
  return answer(ctx, body?.query)
}

export const onRequestOptions = preflight
