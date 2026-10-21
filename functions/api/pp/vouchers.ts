/** /api/pp/vouchers — the public Daraz vouchers the agent currently knows about. */

import { json, preflight } from '../../../ecommerce-price-tracker/worker/http.ts'
import { loadVouchers } from '../../../ecommerce-price-tracker/worker/store.ts'
import type { Env } from '../../../ecommerce-price-tracker/worker/types.ts'

export const onRequestGet = async ({ request, env }: { request: Request; env: Env }) => {
  if (!env.PP_DB) return json(request, { error: 'Voucher store not configured.' }, 503)
  const { vouchers, harvestedAt } = await loadVouchers(env.PP_DB, new Date().toISOString().slice(0, 10))
  return json(request, { count: vouchers.length, harvestedAt, results: vouchers })
}

export const onRequestOptions = preflight
