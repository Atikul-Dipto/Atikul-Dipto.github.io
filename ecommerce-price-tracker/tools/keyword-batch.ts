/**
 * Runs a store's search-keyword dump through the agent, from this PC.
 *
 *   node tools/keyword-batch.ts run    data/keywords/<dump>.csv [--top 2000] [--pause 2500] [--cartup-pages 8]
 *   node tools/keyword-batch.ts report [--flag no_daraz] [--limit 40]
 *   node tools/keyword-batch.ts push   [--listings 20000]   (writes data/keywords/push.sql)
 *
 * The CSV needs `keyword` and `searchers` columns; the most-searched run first,
 * and a stopped run picks up where it left off.
 *
 * - The real agent (worker/agent.ts) answers each keyword as a product-name
 *   search, exactly as the site would. No AI is called (a name alone never
 *   reaches it) and nothing goes into the live `asks` log.
 * - Cartup's name index is the local copy the weekly `--index-cartup` builds
 *   (data/cartup/index.sqlite); its category list is downloaded from D1 once.
 * - Every price seen, not only the ones an answer shows, goes into a local
 *   database (data/keywords/batch.sqlite), plus up to --cartup-pages more
 *   Cartup product pages per keyword: no shopper is waiting here.
 * - Each answer is checked for signs it's wrong (see `flagsFor`), for review.
 * - `push` writes the unsent price points as SQL for
 *   `npx wrangler d1 execute price-pulse --remote --file data/keywords/push.sql`,
 *   most-searched first. D1's free plan allows 100k written rows a day and a
 *   new listing costs about four, so a big run is pushed over a few days.
 *
 * Polite by design: one keyword at a time with a pause between, the same
 * public endpoints the agent uses, and a long back-off if Daraz stops
 * answering with JSON.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { execSync } from 'node:child_process'
import { run, type Answer } from '../worker/agent.ts'
import { toListing } from '../worker/daraz.ts'
import { parseCategoryPage, parseProductPage, searchIndex } from '../worker/cartup.ts'
import { recordListings } from '../worker/store.ts'
import { foundWords, isAccessory, isBundle, quantities, sizesAgree, tokens } from '../worker/ranking.ts'
import type { D1Database, D1Statement, Listing } from '../worker/types.ts'

const ROOT = new URL('../', import.meta.url)
const path = (p: string) => decodeURIComponent(new URL(p, ROOT).pathname).replace(/^\/([A-Za-z]:)/, '$1')
const DIR = path('data/keywords/')
const DB_FILE = DIR + 'batch.sqlite'
const INDEX_FILE = path('data/cartup/index.sqlite')
const CATEGORIES_FILE = DIR + 'cartup_categories.json'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

const args = process.argv.slice(2)
const option = (name: string, fallback: number) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? Number(args[i + 1]) : fallback
}
const textOption = (name: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : null
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ---- local database: D1's schema, the Cartup index attached ----

function open(forAgent = true): DatabaseSync {
  const fresh = !existsSync(DB_FILE)
  const db = new DatabaseSync(DB_FILE)
  db.exec('PRAGMA busy_timeout = 10000') // a report can run beside a batch
  if (!forAgent) return db
  if (fresh) {
    db.exec(readFileSync(path('worker/migrations/0001_init.sql'), 'utf8'))
    db.exec(`ALTER TABLE listings ADD COLUMN kw_rank INTEGER;
             ALTER TABLE price_history ADD COLUMN pushed INTEGER NOT NULL DEFAULT 0;
             CREATE TABLE cartup_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
             CREATE TABLE batch_runs (keyword TEXT PRIMARY KEY, rank INTEGER, searchers INTEGER, ran_at TEXT,
                                      mode TEXT, flags TEXT, summary TEXT, error TEXT, ms INTEGER, requests INTEGER);`)
  }
  db.exec(`ATTACH DATABASE '${INDEX_FILE.replace(/'/g, "''")}' AS idx`)
  // The index's own meta row (rebuilt weekly) beside the categories from D1.
  db.exec(`DELETE FROM cartup_meta; INSERT INTO cartup_meta SELECT key, value FROM idx.cartup_meta`)
  const categories = JSON.parse(readFileSync(CATEGORIES_FILE, 'utf8'))[0].results as { key: string; value: string }[]
  const put = db.prepare('INSERT OR REPLACE INTO cartup_meta (key, value) VALUES (?, ?)')
  for (const c of categories) put.run(c.key, c.value)
  return db
}

/** The D1 calls the worker makes, on node:sqlite. */
function asD1(sqlite: DatabaseSync): D1Database {
  type Local = D1Statement & { exec(): void }
  const prepare = (sql: string): Local => {
    let values: unknown[] = []
    const params = () => values as (string | number | null)[]
    const statement: Local = {
      bind: (...v) => ((values = v), statement),
      first: async <T>() => (sqlite.prepare(sql).get(...params()) ?? null) as T | null,
      all: async <T>() => ({ results: sqlite.prepare(sql).all(...params()) as T[] }),
      run: async () => sqlite.prepare(sql).run(...params()),
      exec: () => void sqlite.prepare(sql).run(...params()),
    }
    return statement
  }
  return {
    prepare,
    batch: async (statements) => {
      sqlite.exec('BEGIN')
      try {
        for (const s of statements) (s as Local).exec()
        sqlite.exec('COMMIT')
      } catch (e) {
        sqlite.exec('ROLLBACK')
        throw e
      }
      return []
    },
  }
}

// ---- every response the agent reads, recorded and counted ----

let seen: Listing[] = []
let requests = 0
let darazRefusals = 0
const fetchedCartup = new Set<string>()
const realFetch = globalThis.fetch

globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
  requests++
  const url = new URL(input instanceof Request ? input.url : String(input))
  const response = await realFetch(input, init)
  try {
    if (url.hostname.endsWith('daraz.com.bd') && url.searchParams.get('ajax') === 'true') {
      const body = await response.clone().text()
      try {
        const data = JSON.parse(body) as { mods?: { listItems?: unknown[] } }
        seen.push(...(data.mods?.listItems ?? []).map(toListing).filter((l): l is Listing => l !== null))
        darazRefusals = 0
      } catch {
        darazRefusals++ // a challenge page instead of results
      }
    } else if (url.hostname === 'www.cartup.com' && response.ok) {
      const html = await response.clone().text()
      if (url.pathname.startsWith('/product/')) {
        const slug = url.pathname.slice('/product/'.length)
        fetchedCartup.add(slug)
        const l = parseProductPage(html, slug)
        if (l) seen.push(l)
      } else if (url.pathname.startsWith('/category/')) {
        seen.push(...parseCategoryPage(html))
      }
    }
  } catch {
    // recording must never break an answer
  }
  return response
}

// ---- what looks wrong in an answer ----

const IGNORE = new Set(['for', 'with', 'and', 'the', 'of', 'in', 'men', 'women', 'man', 'woman', 'boys', 'girls', 'kids', 'baby', 'best', 'price', 'bd', 'original', 'new'])

/** Signs an answer may be wrong, for a person to review. */
export function flagsFor(keyword: string, answer: Answer): string[] {
  const flags: string[] = []
  const want = tokens(keyword).filter((w) => !IGNORE.has(w) && !/^\d+$/.test(w))
  if (/[ঀ-৿]/.test(keyword)) flags.push('bangla')
  const wanted = quantities(keyword)
  for (const s of answer.stores) {
    const pick = s.recommended?.listing
    if (!pick) {
      flags.push(`no_${s.site}`)
      continue
    }
    const missing = want.filter((w) => !foundWords([w], pick.name).length)
    if (missing.length) flags.push(`${s.site}_misses:${missing.join('+')}`)
    if (wanted.size && quantities(pick.name).size && !sizesAgree(wanted, pick.name)) flags.push(`${s.site}_size`)
    if (isBundle(pick.name) && !isBundle(keyword)) flags.push(`${s.site}_bundle`)
    if (isAccessory(pick, tokens(keyword))) flags.push(`${s.site}_accessory`)
    const prices = s.matches.map((m) => m.listing.price).sort((a, b) => a - b)
    const median = prices[Math.floor(prices.length / 2)]
    if (prices.length >= 3 && (pick.price < median / 4 || pick.price > median * 4)) flags.push(`${s.site}_price_outlier`)
  }
  return flags
}

const brief = (answer: Answer) =>
  answer.stores.map((s) => ({
    site: s.site,
    pick: s.recommended ? { name: s.recommended.listing.name, price: s.recommended.listing.price, seller: s.recommended.listing.seller } : null,
    note: s.note,
    matches: s.matches.map((m) => ({ label: m.label, name: m.listing.name, price: m.listing.price })),
  }))

// ---- commands ----

async function runAll(csvFile: string) {
  const top = option('top', 2000)
  const pause = option('pause', 2500)
  const extraPages = option('cartup-pages', 8)
  const sqlite = open()
  const db = asD1(sqlite)
  const done = new Set((sqlite.prepare('SELECT keyword FROM batch_runs').all() as { keyword: string }[]).map((r) => r.keyword))

  const [header, ...lines] = readFileSync(csvFile, 'utf8').split(/\r?\n/).filter(Boolean)
  const cols = parseCsvLine(header)
  const k = cols.indexOf('keyword')
  const u = cols.indexOf('searchers')
  const keywords = lines
    .map((line) => parseCsvLine(line))
    .map((c) => ({ keyword: c[k].replace(/\s+/g, ' ').trim(), searchers: Number(c[u]) || 0 }))
    .filter((r) => r.keyword.length > 1)
    .sort((a, b) => b.searchers - a.searchers)
    .slice(0, top)

  const save = sqlite.prepare(
    'INSERT OR REPLACE INTO batch_runs (keyword, rank, searchers, ran_at, mode, flags, summary, error, ms, requests) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
  const ranked = sqlite.prepare('UPDATE listings SET kw_rank = ? WHERE item_id = ? AND kw_rank IS NULL')
  let ran = 0
  for (const [i, { keyword, searchers }] of keywords.entries()) {
    if (done.has(keyword)) continue
    if (darazRefusals >= 3) {
      console.log(`Daraz is refusing (${darazRefusals} in a row): waiting 15 minutes`)
      await sleep(15 * 60_000)
      darazRefusals = 0
    }
    seen = []
    requests = 0
    const started = Date.now()
    let answer: Answer | null = null
    let error: string | null = null
    try {
      answer = await run({ name: keyword }, { PP_DB: db })
      // More of Cartup's own listings for this name than a shopper could wait for.
      const { slugs } = await searchIndex(db, keyword)
      for (const slug of slugs.filter((s) => !fetchedCartup.has(s)).slice(0, extraPages)) {
        await fetch(`https://www.cartup.com/product/${slug}`, { headers: { 'user-agent': UA, accept: 'text/html' }, signal: AbortSignal.timeout(6000) }).catch(() => null)
        await sleep(300)
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }
    const listings = [...new Map(seen.filter((l) => l.price > 0).map((l) => [l.itemId, l])).values()]
    if (listings.length) {
      await recordListings(db, listings, new Date().toISOString())
      for (const l of listings) ranked.run(i, l.itemId)
    }
    const flags = answer ? flagsFor(keyword, answer) : ['error']
    save.run(keyword, i, searchers, new Date().toISOString(), answer?.intent.mode ?? null, flags.join(' '), answer ? JSON.stringify(brief(answer)) : null, error, Date.now() - started, requests)
    ran++
    const picks = answer?.stores.map((s) => `${s.label}: ${s.recommended ? `৳${s.recommended.listing.price} ${s.recommended.listing.name.slice(0, 50)}` : '—'}`).join(' | ')
    console.log(`#${i + 1} ${keyword} (${searchers}) ${answer?.intent.mode ?? 'ERROR'} ${listings.length} prices ${Date.now() - started}ms ${flags.join(' ')}\n    ${picks ?? error}`)
    await sleep(pause)
  }
  console.log(`done: ${ran} keywords run`)
}

function report() {
  const sqlite = open(false)
  const limit = option('limit', 30)
  const only = textOption('flag')
  const rows = sqlite.prepare('SELECT keyword, searchers, mode, flags, summary, error FROM batch_runs ORDER BY rank').all() as {
    keyword: string
    searchers: number
    mode: string
    flags: string
    summary: string | null
    error: string | null
  }[]
  const counts = new Map<string, number>()
  for (const r of rows) for (const f of new Set((r.flags || '').split(' ').filter(Boolean).map((f) => f.split(':')[0]))) counts.set(f, (counts.get(f) ?? 0) + 1)
  const clean = rows.filter((r) => !r.flags).length
  const stats = sqlite.prepare("SELECT (SELECT COUNT(*) FROM listings WHERE site='daraz') AS daraz, (SELECT COUNT(*) FROM listings WHERE site='cartup') AS cartup, (SELECT COUNT(*) FROM price_history WHERE pushed=0) AS unsent").get()
  console.log(`${rows.length} keywords run, ${clean} with nothing flagged. Prices saved: ${JSON.stringify(stats)}`)
  for (const [f, n] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`  ${f.padEnd(24)} ${n}`)
  if (!only) return
  console.log()
  for (const r of rows.filter((r) => (r.flags || '').split(' ').some((f) => f.split(':')[0] === only)).slice(0, limit)) {
    console.log(`## ${r.keyword} (${r.searchers}) ${r.mode} [${r.flags}]${r.error ? ' ' + r.error : ''}`)
    for (const s of JSON.parse(r.summary ?? '[]') as ReturnType<typeof brief>) {
      console.log(`   ${s.site}: ${s.pick ? `৳${s.pick.price} ${s.pick.name.slice(0, 90)}` : `— ${s.note ?? ''}`}`)
      for (const m of s.matches.slice(0, 3)) console.log(`      ${m.label}: ৳${m.price} ${m.name.slice(0, 80)}`)
    }
  }
}

/** Unsent price points as SQL, most-searched keywords' listings first. */
function push() {
  const sqlite = open(false)
  const max = option('listings', 20000)
  const points = sqlite
    .prepare(
      `SELECT h.id, h.item_id, h.price, h.original_price, h.seen_at, l.site, l.name, l.url
         FROM price_history h JOIN listings l ON l.item_id = h.item_id
        WHERE h.pushed = 0 ORDER BY COALESCE(l.kw_rank, 1e9), h.seen_at LIMIT ?`,
    )
    .all(max) as { id: number; item_id: string; price: number; original_price: number | null; seen_at: string; site: string; name: string; url: string }[]
  if (!points.length) return console.log('nothing to push')
  const q = (v: string | number | null) => (v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${v.replace(/'/g, "''")}'`)
  const sql = points.flatMap((p) => {
    const cutoff = new Date(Date.parse(p.seen_at) - 6 * 3600_000).toISOString()
    return [
      `INSERT INTO listings (item_id, site, name, url, first_seen, last_seen) VALUES (${q(p.item_id)}, ${q(p.site)}, ${q(p.name)}, ${q(p.url)}, ${q(p.seen_at)}, ${q(p.seen_at)}) ` +
        `ON CONFLICT(item_id) DO UPDATE SET last_seen = MAX(last_seen, excluded.last_seen);`,
      `INSERT INTO price_history (item_id, price, original_price, seen_at, source) SELECT ${q(p.item_id)}, ${p.price}, ${q(p.original_price)}, ${q(p.seen_at)}, 'batch' ` +
        `WHERE NOT EXISTS (SELECT 1 FROM price_history WHERE item_id = ${q(p.item_id)} AND seen_at > ${q(cutoff)} AND price = ${p.price} ` +
        `AND seen_at = (SELECT MAX(seen_at) FROM price_history WHERE item_id = ${q(p.item_id)}));`,
    ]
  })
  writeFileSync(DIR + 'push.sql', sql.join('\n'))
  if (args.includes('--send')) {
    execSync('npx wrangler d1 execute price-pulse --remote --file ecommerce-price-tracker/data/keywords/push.sql', { cwd: path('../'), stdio: 'inherit' })
  }
  const mark = sqlite.prepare('UPDATE price_history SET pushed = 1 WHERE id = ?')
  if (args.includes('--send') || args.includes('--mark')) for (const p of points) mark.run(p.id)
  console.log(`${points.length} price points written to ${DIR}push.sql${args.includes('--send') ? ' and sent' : ' (not sent; --send to run wrangler)'}`)
}

function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') (cur += '"'), i++
      else if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') out.push(cur), (cur = '')
    else cur += ch
  }
  out.push(cur)
  return out
}

const command = args[0]
if (command === 'run') await runAll(args[1])
else if (command === 'report') report()
else if (command === 'push') push()
else console.log('usage: node tools/keyword-batch.ts run <csv> [--top N] | report [--flag F] | push [--send]')
