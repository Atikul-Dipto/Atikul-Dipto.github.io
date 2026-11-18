/**
 * The GTA VI watch party lobby: a Cloudflare Pages Function, served at
 * /api/watchparty on the Cloudflare copy of the site and called from both
 * copies of /gta6-watch-party/.
 *
 *   GET     the lobby: head count, cope total, rigs, the latest 120 seats
 *   POST    { handle, rig, cope, line }: claim a seat
 *   DELETE  ?n=<seat> with "Authorization: Bearer <ADMIN_TOKEN>": take a
 *           seat down (it is kept, hidden, never shown)
 *
 * Storage is the D1 database bound as DB (tables in migrations/0002). A GET
 * reads one row, the lobby kept as a JSON snapshot. A new seat bumps its
 * totals in place (one atomic UPDATE) and refreshes the latest 120, so a claim
 * costs about the same with 10 seats or 10,000; only a take-down recounts the
 * whole table. Nothing about a visitor is stored but what they type; spam
 * limits use a salted hash of the connection address that changes every day,
 * and those rows are cleared after two days.
 */

import { abusive } from '../_lib/abuse'

interface D1Result<T> {
  results: T[]
  meta: { last_row_id: number; changes: number }
}
interface D1Stmt {
  bind(...v: unknown[]): D1Stmt
  first<T>(): Promise<T | null>
  all<T>(): Promise<D1Result<T>>
  run(): Promise<D1Result<unknown>>
}
interface Env {
  DB: { prepare(sql: string): D1Stmt }
  ADMIN_TOKEN?: string
  IP_SALT?: string
}
type Ctx = { request: Request; env: Env }

interface Seat {
  n: number
  handle: string
  rig: string
  cope: number
  line: string
}
interface Lobby {
  count: number
  copeSum: number
  rigs: Record<string, number>
  recent: Seat[]
}

const MAX_SEATS = 20000
const RECENT = 120
// The rigs on the page's list (RIG_GROUPS in public/gta6-watch-party/index.html).
// 'other' comes with a typed-in rigName and is stored as "custom:<name>".
const RIGS = new Set(
  (
    'rtx5090 rtx5080 rtx5070ti rtx5070 rtx5060ti rtx5060 rtx5050 ' +
    'rtx4090 rtx4080s rtx4080 rtx4070tis rtx4070ti rtx4070s rtx4070 rtx4060ti rtx4060 ' +
    'rtx3090ti rtx3090 rtx3080ti rtx3080 rtx3070ti rtx3070 rtx3060ti rtx3060 rtx3050 ' +
    'rtx2080ti rtx2080s rtx2080 rtx2070s rtx2070 rtx2060s rtx2060 ' +
    'gtx1660ti gtx1660s gtx1660 gtx1650s gtx1650 gtx1630 ' +
    'gtx1080ti gtx1080 gtx1070ti gtx1070 gtx1060 gtx1050ti gtx1050 gt1030 ' +
    'titan nvlaptop gtx900 ' +
    'rx9070xt rx9070 rx9060xt rx7900xtx rx7900xt rx7900gre rx7800xt rx7700xt rx7600 ' +
    'rx6900xt rx6800xt rx6700xt rx6600 rx5700 rx580 radeon ' +
    'arcb580 arcb570 arca770 arca750 arc ' +
    'igpu deck ps5 other'
  ).split(' '),
)
const CUSTOM = 'custom:'
/** The lobby's rig tally counts every typed-in rig as one: "other". */
const bucket = (rig: string) => (rig.startsWith(CUSTOM) ? 'other' : rig)
const ALLOWED = [
  /^https:\/\/([a-z0-9-]+\.)?vice-cope\.pages\.dev$/,
  /^https:\/\/atikul-dipto\.github\.io$/,
  /^https:\/\/([a-z0-9-]+\.)?atikul-islam-portfolio\.pages\.dev$/, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/]

function cors(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') ?? ''
  if (!ALLOWED.some((re) => re.test(origin))) return {}
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-max-age': '86400',
    vary: 'origin',
  }
}

const json = (request: Request, body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...cors(request), ...extra } })

// ---- the rules for a seat -------------------------------------------------------

const tidy = (raw: unknown) => (typeof raw === 'string' ? raw.normalize('NFC').replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/g, ' ').trim() : null)

function cleanHandle(raw: unknown): string | null {
  const h = tidy(raw)
  if (!h || h.length < 2 || h.length > 24) return null
  if (!/^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} ._'’-]*$/u.test(h)) return null
  return h
}

function cleanLine(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return ''
  const l = tidy(raw)
  if (l === null || l.length > 90) return null
  return l
}

function cleanRigName(raw: unknown): string | null {
  const r = tidy(raw)
  if (!r || r.length < 2 || r.length > 32) return null
  if (!/^[\p{L}\p{N}][\p{L}\p{M}\p{N} .,+_/()'’-]*$/u.test(r)) return null
  return r
}

const hasLink =(s: string) => /https?:|www\.|\b[a-z0-9-]+\.(com|net|org|io|gg|xyz|ru|tk|ly|me)\b/i.test(s)

// ---- storage -------------------------------------------------------------------

const EMPTY: Lobby = { count: 0, copeSum: 0, rigs: {}, recent: [] }

async function readLobby(env: Env): Promise<Lobby> {
  const row = await env.DB.prepare("SELECT value FROM snapshot WHERE key = 'squad'").first<{ value: string }>()
  try {
    return row ? (JSON.parse(row.value) as Lobby) : EMPTY
  } catch {
    return EMPTY
  }
}

/** Rebuild the snapshot from the table, so two seats claimed at once both count. */
async function rebuild(env: Env): Promise<Lobby> {
  const totals = await env.DB.prepare('SELECT COUNT(*) AS c, COALESCE(SUM(cope), 0) AS s FROM squad WHERE hidden = 0').first<{ c: number; s: number }>()
  const { results: rigRows } = await env.DB.prepare(
    "SELECT CASE WHEN rig LIKE 'custom:%' THEN 'other' ELSE rig END AS rig, COUNT(*) AS c FROM squad WHERE hidden = 0 GROUP BY 1",
  ).all<{ rig: string; c: number }>()
  const { results: recent } = await env.DB.prepare('SELECT n, handle, rig, cope, line FROM squad WHERE hidden = 0 ORDER BY n DESC LIMIT ?').bind(RECENT).all<Seat>()
  const lobby: Lobby = {
    count: totals?.c ?? 0,
    copeSum: totals?.s ?? 0,
    rigs: Object.fromEntries(rigRows.map((r) => [r.rig, r.c])),
    recent,
  }
  await env.DB.prepare("INSERT INTO snapshot (key, value) VALUES ('squad', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(JSON.stringify(lobby)).run()
  return lobby
}

/** Count one new seat into the snapshot without rescanning the table. */
async function addSeat(env: Env, seat: Seat): Promise<Lobby> {
  const rigPath = `$.rigs."${bucket(seat.rig)}"` // a key from the fixed RIGS list
  const bumped = await env.DB.prepare(
    "UPDATE snapshot SET value = json_set(value, '$.count', COALESCE(json_extract(value, '$.count'), 0) + 1, '$.copeSum', COALESCE(json_extract(value, '$.copeSum'), 0) + ?, ?, COALESCE(json_extract(value, ?), 0) + 1) WHERE key = 'squad'",
  )
    .bind(seat.cope, rigPath, rigPath)
    .run()
  if (!bumped.meta.changes) return rebuild(env)
  const { results: recent } = await env.DB.prepare('SELECT n, handle, rig, cope, line FROM squad WHERE hidden = 0 ORDER BY n DESC LIMIT ?').bind(RECENT).all<Seat>()
  await env.DB.prepare("UPDATE snapshot SET value = json_set(value, '$.recent', json(?)) WHERE key = 'squad'").bind(JSON.stringify(recent)).run()
  return readLobby(env)
}

async function ipHash(request: Request, env: Env) {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown'
  const day = new Date().toISOString().slice(0, 10)
  const data = new TextEncoder().encode(`${env.IP_SALT ?? 'silo'}|watchparty|${day}|${ip}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ---- the handlers --------------------------------------------------------------

export const onRequestOptions = ({ request }: Ctx) => new Response(null, { status: 204, headers: cors(request) })

export async function onRequestGet({ request, env }: Ctx) {
  return json(request, await readLobby(env), 200, { 'cache-control': 'public, max-age=20' })
}

export async function onRequestPost({ request, env }: Ctx) {
  let body: { handle?: unknown; rig?: unknown; rigName?: unknown; cope?: unknown; line?: unknown }
  try {
    body = await request.json()
  } catch {
    return json(request, { error: 'That arrived at 30 FPS and lost a few frames. Try again.' }, 400)
  }
  const handle = cleanHandle(body.handle)
  if (!handle) return json(request, { error: 'A handle of 2 to 24 letters or numbers (spaces, dots, dashes and underscores allowed).' }, 400)
  let rig = typeof body.rig === 'string' && RIGS.has(body.rig) ? body.rig : null
  if (!rig) return json(request, { error: 'Pick your rig from the list.' }, 400)
  if (rig === 'other') {
    const name = cleanRigName(body.rigName)
    if (!name) return json(request, { error: 'Type your GPU in 2 to 32 characters (letters, numbers, spaces and . , + - / ( ) allowed).' }, 400)
    if (abusive(name)) return json(request, { error: 'Keep it funny, not foul. That rig cannot go in the lobby.' }, 400)
    if (hasLink(name)) return json(request, { error: 'No links in the lobby. Just vibes and frame rates.' }, 400)
    rig = CUSTOM + name
  }
  const cope = Number(body.cope)
  if (!Number.isInteger(cope) || cope < 0 || cope > 100) return json(request, { error: 'Cope goes from 0 to 100. Even yours.' }, 400)
  const line = cleanLine(body.line)
  if (line === null) return json(request, { error: 'Keep the cope line under 90 characters.' }, 400)
  if (abusive(handle) || abusive(line)) return json(request, { error: 'Keep it funny, not foul. That one cannot go in the lobby.' }, 400)
  if (hasLink(handle) || hasLink(line)) return json(request, { error: 'No links in the lobby. Just vibes and frame rates.' }, 400)

  const hash = await ipHash(request, env)
  const now = Date.now()
  const recent = await env.DB.prepare('SELECT COUNT(*) AS c FROM squad_joins WHERE ip_hash = ? AND at > ?').bind(hash, now - 60_000).first<{ c: number }>()
  if ((recent?.c ?? 0) >= 1) return json(request, { error: 'One seat a minute, please. The doorman runs at 30 FPS.' }, 429)
  const today = await env.DB.prepare('SELECT COUNT(*) AS c FROM squad_joins WHERE ip_hash = ? AND at > ?').bind(hash, now - 86_400_000).first<{ c: number }>()
  if ((today?.c ?? 0) >= 3) return json(request, { error: 'Three seats a day from one connection. Come back tomorrow.' }, 429)

  const lobby = await readLobby(env)
  if (lobby.count >= MAX_SEATS) return json(request, { error: 'The lobby is full. Even the floor.' }, 409)

  const res = await env.DB.prepare('INSERT INTO squad (handle, rig, cope, line) VALUES (?, ?, ?, ?)').bind(handle, rig, cope, line).run()
  const seat: Seat = { n: res.meta.last_row_id, handle, rig, cope, line }
  await env.DB.prepare('INSERT INTO squad_joins (ip_hash, at) VALUES (?, ?)').bind(hash, now).run()
  // Old spam-limit rows go now and then (that DELETE scans the table, so not on every claim).
  if (Math.random() < 0.05) await env.DB.prepare('DELETE FROM squad_joins WHERE at < ?').bind(now - 2 * 86_400_000).run()
  const fresh = await addSeat(env, seat)
  return json(request, { seat, lobby: fresh }, 201)
}

export async function onRequestDelete({ request, env }: Ctx) {
  const auth = request.headers.get('authorization') ?? ''
  if (!env.ADMIN_TOKEN || auth !== `Bearer ${env.ADMIN_TOKEN}`) return json(request, { error: 'Not allowed.' }, 403)
  const n = Number(new URL(request.url).searchParams.get('n'))
  if (!Number.isInteger(n) || n < 1) return json(request, { error: 'Which seat?' }, 400)
  await env.DB.prepare('UPDATE squad SET hidden = 1 WHERE n = ?').bind(n).run()
  const lobby = await rebuild(env)
  return json(request, { removed: n, count: lobby.count })
}
