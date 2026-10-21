/**
 * The agent's memory in D1 (binding PP_DB, schema in ./migrations/).
 *
 * Every answer writes the prices it saw back as history, so "the price we
 * last saw" is real: seeded from the local Postgres scrape history
 * (`python -m agent --seed-d1`), then grown by every lookup. A new point is only
 * written when the price changed or the last point is over 6h old, so a
 * popular search doesn't fill the table with identical rows.
 *
 * Vouchers are written by the harvester on the developer's PC (Selenium
 * can't run here) — see ../agent/vouchers.py and `python -m agent
 * --harvest-vouchers --push-d1`.
 *
 * `asks` logs each question (text, outcome, timings — nothing about the
 * visitor) so how well the agent works can be checked from real use.
 */

import type { D1Database, HistoryMatch, Listing, Voucher } from './types.ts'

const SAME_PRICE_WINDOW_HOURS = 6
const VOUCHER_MAX_AGE_DAYS = 3

export async function lookupHistory(db: D1Database, listings: Listing[]): Promise<Map<string, HistoryMatch>> {
  const ids = listings.map((l) => l.itemId).filter(Boolean)
  const found = new Map<string, HistoryMatch>()
  if (!ids.length) return found
  const marks = ids.map(() => '?').join(',')
  const { results } = await db
    .prepare(
      `SELECT h.item_id, COUNT(*) AS checks, MIN(h.price) AS lowest, MAX(h.price) AS highest, MIN(h.seen_at) AS first_seen,
              (SELECT price FROM price_history WHERE item_id = h.item_id ORDER BY seen_at DESC LIMIT 1) AS last_price,
              MAX(h.seen_at) AS last_seen
         FROM price_history h WHERE h.item_id IN (${marks}) GROUP BY h.item_id`,
    )
    .bind(...ids)
    .all<{ item_id: string; checks: number; lowest: number; highest: number; first_seen: string; last_price: number; last_seen: string }>()
  for (const r of results) {
    found.set(r.item_id, {
      lastPrice: r.last_price,
      lastSeen: r.last_seen,
      lowestPrice: r.lowest,
      highestPrice: r.highest,
      checks: r.checks,
      firstSeen: r.first_seen,
    })
  }
  return found
}

export async function recordListings(db: D1Database, listings: Listing[], now: string): Promise<void> {
  const cutoff = new Date(Date.parse(now) - SAME_PRICE_WINDOW_HOURS * 3600_000).toISOString()
  const statements = listings.flatMap((l) => [
    db
      .prepare(
        `INSERT INTO listings (item_id, site, name, url, first_seen, last_seen) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(item_id) DO UPDATE SET name = excluded.name, url = excluded.url, last_seen = excluded.last_seen`,
      )
      .bind(l.itemId, l.site, l.name, l.url, now, now),
    db
      .prepare(
        `INSERT INTO price_history (item_id, price, original_price, seen_at, source)
         SELECT ?, ?, ?, ?, 'agent'
          WHERE NOT EXISTS (
            SELECT 1 FROM price_history WHERE item_id = ? AND seen_at > ?
               AND price = ? AND seen_at = (SELECT MAX(seen_at) FROM price_history WHERE item_id = ?))`,
      )
      .bind(l.itemId, l.price, l.originalPrice, now, l.itemId, cutoff, l.price, l.itemId),
  ])
  if (statements.length) await db.batch(statements)
}

interface VoucherRow {
  site: string
  title: string
  labels: string
  amount: number | null
  percent: number | null
  max_discount: number | null
  min_spend: number | null
  valid_from: string | null
  valid_to: string | null
  source_url: string
  last_seen: string
}

export async function loadVouchers(db: D1Database, today: string): Promise<{ vouchers: Voucher[]; harvestedAt: string | null }> {
  const since = new Date(Date.parse(today) - VOUCHER_MAX_AGE_DAYS * 86400_000).toISOString()
  const { results } = await db
    .prepare(`SELECT * FROM vouchers WHERE last_seen >= ? AND (valid_to IS NULL OR valid_to >= ?) ORDER BY last_seen DESC`)
    .bind(since, today)
    .all<VoucherRow>()
  const latest = await db.prepare(`SELECT MAX(last_seen) AS at FROM vouchers`).first<{ at: string | null }>()
  return {
    harvestedAt: latest?.at ?? null,
    vouchers: results.map((r) => ({
      site: r.site,
      title: r.title,
      labels: JSON.parse(r.labels || '[]'),
      amount: r.amount,
      percent: r.percent,
      maxDiscount: r.max_discount,
      minSpend: r.min_spend,
      validFrom: r.valid_from,
      validTo: r.valid_to,
      sourceUrl: r.source_url,
    })),
  }
}

export interface AskLog {
  askedAt: string
  query: string
  mode: string
  intentSource: string
  results: number
  bestPrice: number | null
  bestFinal: number | null
  voucherApplied: boolean
  totalMs: number
  timings: Record<string, number>
  error: string | null
}

export async function logAsk(db: D1Database, a: AskLog): Promise<void> {
  await db
    .prepare(
      `INSERT INTO asks (asked_at, query, mode, intent_source, results, best_price, best_final, voucher_applied, total_ms, timings, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(a.askedAt, a.query.slice(0, 200), a.mode, a.intentSource, a.results, a.bestPrice, a.bestFinal, a.voucherApplied ? 1 : 0, a.totalMs, JSON.stringify(a.timings), a.error)
    .run()
}

export async function stats(db: D1Database) {
  const totals = await db
    .prepare(
      `SELECT COUNT(*) AS asks,
              SUM(CASE WHEN results > 0 THEN 1 ELSE 0 END) AS answered,
              SUM(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END) AS errors,
              SUM(voucher_applied) AS with_voucher,
              SUM(CASE WHEN intent_source = 'llm' THEN 1 ELSE 0 END) AS llm,
              AVG(total_ms) AS avg_ms
         FROM asks`,
    )
    .first<Record<string, number>>()
  const { results: recent } = await db
    .prepare(`SELECT asked_at, query, mode, results, best_price, best_final, total_ms, error FROM asks ORDER BY id DESC LIMIT 30`)
    .all()
  const tracked = await db.prepare(`SELECT COUNT(*) AS listings, (SELECT COUNT(*) FROM price_history) AS points FROM listings`).first()
  return { totals, tracked, recent }
}
