/**
 * /api/pp/stats — how the agent is doing in real use. Totals are public;
 * the list of recent questions is not (people type what they type), so it
 * needs "Authorization: Bearer <ADMIN_TOKEN>", the same secret as the silo's
 * citizens register.
 */

import { json, preflight } from '../../../ecommerce-price-tracker/worker/http.ts'
import { stats } from '../../../ecommerce-price-tracker/worker/store.ts'
import type { Env } from '../../../ecommerce-price-tracker/worker/types.ts'

export const onRequestGet = async ({ request, env }: { request: Request; env: Env & { ADMIN_TOKEN?: string } }) => {
  if (!env.PP_DB) return json(request, { error: 'Not configured.' }, 503)
  const { totals, tracked, recent } = await stats(env.PP_DB)
  const admin = Boolean(env.ADMIN_TOKEN) && request.headers.get('authorization') === `Bearer ${env.ADMIN_TOKEN}`
  return json(request, admin ? { totals, tracked, recent } : { totals, tracked })
}

export const onRequestOptions = preflight
