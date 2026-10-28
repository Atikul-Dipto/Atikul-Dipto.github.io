/**
 * Does a voucher work on a listing? Checked against its *published* terms
 * only — dates, minimum spend, cap, and the badges printed on the card. Port
 * of ../agent/eligibility.py; pure arithmetic, the model never touches it.
 *
 * Unknowable without a login, and said so instead of guessed: whether a
 * campaign voucher covers this exact item, store vouchers, personal vouchers.
 * Daraz allows one platform voucher per order: the best single one is picked.
 */

import type { Listing, Voucher, VoucherCheck } from './types.ts'

// Badges with a well-known meaning. Anything else is passed through verbatim
// ("bKash Choice Exclusive" could mean a payment method, a campaign, or both).
const CONDITION_LABELS: Record<string, string> = {
  bkash: 'Pay with bKash',
  nagad: 'Pay with Nagad',
  card: 'Pay with the bank card named on the voucher',
  bank: 'Pay with the bank card named on the voucher',
  'new user': 'New Daraz accounts only',
  'first order': 'First order only',
  app: 'Only in the Daraz app',
  'limited redemption': 'Limited redemptions — can run out',
}
const MALL_LABELS = ['mall', 'lazmall', 'daraz mall']

const BADGE_HINTS: Record<string, string> = {
  FreeshippingAndVoucherMax: "Seller is in Daraz's voucher programme — log in to Daraz to see store vouchers on this item.",
  coinsAndFreeshipping: 'Daraz Coins can be used, and shipping is free.',
  coins: 'Daraz Coins can be used on this item.',
  Freeshipping: 'Free shipping.',
  lazMall: 'Daraz Mall (official brand store).',
}

export const money = (v: number) => `৳${Math.round(v).toLocaleString('en-US')}`
const fmtDate = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

/** "bKashChoice" from ...?wh_pid=/lazada/channel/bd/weekly-campaigns/bKashChoice */
export function campaignName(sourceUrl: string): string | null {
  try {
    const pid = new URL(sourceUrl).searchParams.get('wh_pid') ?? ''
    const slug = pid.replace(/\/+$/, '').split('/').pop() ?? ''
    return slug && slug !== 'home' ? slug.replace(/[-_]+/g, ' ') : null
  } catch {
    return null
  }
}

export function savingFor(v: Voucher, price: number): number {
  let saving = 0
  if (v.amount !== null) saving = v.amount
  else if (v.percent !== null) {
    saving = Math.floor((price * v.percent) / 100)
    if (v.maxDiscount !== null) saving = Math.min(saving, v.maxDiscount)
  }
  return Math.min(saving, price)
}

export function check(v: Voucher, listing: Listing, today: string): VoucherCheck {
  const no = (reason: string): VoucherCheck => ({ voucher: v, status: 'not_applicable', saving: 0, reasons: [reason], conditions: [] })
  if (v.validTo && v.validTo < today) return no(`Expired on ${fmtDate(v.validTo)}.`)
  if (v.validFrom && v.validFrom > today) return no(`Starts ${fmtDate(v.validFrom)}.`)
  if (v.minSpend !== null && listing.price < v.minSpend) {
    return no(`Needs a ${money(v.minSpend)} order; this item is ${money(listing.price)} (${money(v.minSpend - listing.price)} short).`)
  }
  const labels = v.labels.join(' ').toLowerCase()
  if (MALL_LABELS.some((m) => labels.includes(m)) && !listing.officialStore) return no("Daraz Mall items only; this seller isn't a Mall store.")

  const conditions = [...new Set(Object.entries(CONDITION_LABELS).filter(([k]) => labels.includes(k)).map(([, t]) => t))].sort()
  for (const label of v.labels) {
    if (!Object.keys(CONDITION_LABELS).some((k) => label.toLowerCase().includes(k))) conditions.push(`Labelled "${label}"`)
  }
  const campaign = campaignName(v.sourceUrl)
  if (campaign) conditions.push(`Published on the ${campaign} campaign page — may only cover that campaign's items`)

  const saving = savingFor(v, listing.price)
  const reasons: string[] = []
  if (v.minSpend !== null) reasons.push(`Order is over the ${money(v.minSpend)} minimum.`)
  if (v.validTo) reasons.push(`Valid until ${fmtDate(v.validTo)}.`)
  if (v.percent !== null && v.maxDiscount !== null && saving === v.maxDiscount) reasons.push(`${v.percent}% off, capped at ${money(v.maxDiscount)}.`)
  return { voucher: v, status: conditions.length ? 'conditional' : 'applies', saving, reasons, conditions }
}

export function checkAll(vouchers: Voucher[], listing: Listing, today: string): VoucherCheck[] {
  const order = { applies: 0, conditional: 1, not_applicable: 2 }
  // A store's vouchers only ever apply to that store's listings (Daraz vouchers never to Cartup).
  return vouchers.filter((v) => v.site === listing.site).map((v) => check(v, listing, today)).sort((a, b) => order[a.status] - order[b.status] || b.saving - a.saving)
}

/** Biggest saving among usable vouchers; an unconditional one wins a tie. */
export function bestVoucher(checks: VoucherCheck[]): VoucherCheck | null {
  const usable = checks.filter((c) => c.status !== 'not_applicable' && c.saving > 0)
  if (!usable.length) return null
  return usable.reduce((best, c) => (c.saving > best.saving || (c.saving === best.saving && c.status === 'applies') ? c : best))
}

export const listingHints = (l: Listing) => [...new Set(l.badges)].filter((b) => b in BADGE_HINTS).map((b) => BADGE_HINTS[b])
