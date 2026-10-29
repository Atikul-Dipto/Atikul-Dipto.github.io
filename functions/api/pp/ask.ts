/**
 * Price Pulse's shopping agent: /api/pp/ask on the Cloudflare copy of the
 * site, called from both copies of /price-pulse/. The agent itself lives with
 * the rest of Price Pulse in ecommerce-price-tracker/worker/.
 *
 *   POST { "name": "Jedel KL69 61 Keys RGB Mechanical Keyboard", "details": "under 2000, blue switch" }
 *        name: a product, searched exactly as typed; details: what they need (read by the AI).
 *        Either may be empty, not both.
 *   GET  ?name=...&details=...    the same
 *   GET  ?q=... / POST { "query" } one-box form: the agent works out whether it's a name or a description
 */

import { type AskInput, run } from '../../../ecommerce-price-tracker/worker/agent.ts'
import { json, preflight } from '../../../ecommerce-price-tracker/worker/http.ts'
import { logAsk } from '../../../ecommerce-price-tracker/worker/store.ts'
import type { Env } from '../../../ecommerce-price-tracker/worker/types.ts'

type Ctx = { request: Request; env: Env; waitUntil(p: Promise<unknown>): void }

const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')

function readInput(raw: { name?: unknown; details?: unknown; query?: unknown }): AskInput | string {
  const name = clean(raw.name)
  const details = clean(raw.details)
  const query = clean(raw.query)
  if (name.length > 200 || details.length > 300 || query.length > 200) return 'That is longer than the agent reads — keep it under 200 characters.'
  if (name || details) return name.length + details.length >= 2 ? { name, details } : 'Ask for a product in at least 2 characters.'
  return query.length >= 2 ? { query } : 'Type a product name, or what you need.'
}

async function answer({ request, env, waitUntil }: Ctx, raw: { name?: unknown; details?: unknown; query?: unknown }): Promise<Response> {
  const input = readInput(raw)
  if (typeof input === 'string') return json(request, { error: input }, 400)
  const logged = input.query ?? [input.name, input.details].filter(Boolean).join(' — ')
  const askedAt = new Date().toISOString()
  try {
    const result = await run(input, env)
    // The cheapest of the stores' recommended options, for the record of how answers went.
    const picks = result.stores.map((st) => st.recommended).filter((r) => r !== null)
    const cheapest = picks.sort((a, b) => a.finalPrice - b.finalPrice)[0] ?? null
    if (env.PP_DB) {
      waitUntil(
        logAsk(env.PP_DB, {
          askedAt,
          query: logged,
          mode: result.intent.mode,
          intentSource: result.intent.source,
          results: result.stores.reduce((n, st) => n + (st.recommended ? 1 : 0) + st.matches.length, 0),
          bestPrice: cheapest?.listing.price ?? null,
          bestFinal: cheapest?.finalPrice ?? null,
          voucherApplied: picks.some((r) => r.bestVoucher),
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
        logAsk(env.PP_DB, { askedAt, query: logged, mode: '', intentSource: '', results: 0, bestPrice: null, bestFinal: null, voucherApplied: false, totalMs: Date.now() - Date.parse(askedAt), timings: {}, error: message.slice(0, 300) }).catch(() => {}),
      )
    }
    return json(request, { error: `Couldn't reach Daraz just now (${message}). Try again in a moment.` }, 502)
  }
}

export const onRequestGet = (ctx: Ctx) => {
  const p = new URL(ctx.request.url).searchParams
  return answer(ctx, { name: p.get('name'), details: p.get('details'), query: p.get('q') })
}

export const onRequestPost = async (ctx: Ctx) => {
  const body = (await ctx.request.json().catch(() => null)) as { name?: unknown; details?: unknown; query?: unknown } | null
  return answer(ctx, body ?? {})
}

export const onRequestOptions = preflight
