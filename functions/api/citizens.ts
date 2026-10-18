/**
 * The Silo's citizens register: a Cloudflare Pages Function, served at
 * /api/citizens on the Cloudflare copy of the site and called from both
 * copies of the silo (silo/src/lib/citizens.ts).
 *
 *   GET     the names on the wall, oldest first
 *   POST    { name }: add one
 *   DELETE  ?n=<number> with "Authorization: Bearer <ADMIN_TOKEN>": take a
 *           name down (it is kept, hidden, never shown)
 *
 * Storage is the D1 database bound as DB (wrangler.toml, migrations/). A GET
 * reads one row -- the visible list kept as a JSON snapshot -- so even a full
 * wall costs a visit one read. Nothing about a visitor is stored but the name
 * they give; spam limits use a salted hash of the connection address that
 * changes every day, and those rows are cleared after two days.
 */

interface D1Result<T> {
  results: T[]
  meta: { last_row_id: number }
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

interface Citizen {
  n: number
  name: string
}

const MAX_CITIZENS = 10000
const ALLOWED = [/^https:\/\/atikul-dipto\.github\.io$/, /^https:\/\/([a-z0-9-]+\.)?atikul-islam-portfolio\.pages\.dev$/, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/]

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

// ---- the rules for a name -----------------------------------------------------

function clean(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const name = raw.normalize('NFC').replace(/\s+/g, ' ').trim()
  if (name.length < 2 || name.length > 40) return null
  if (!/^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u.test(name)) return null
  return name
}

/**
 * Abuse, in English and Bangla (in both scripts). Whole words for the short
 * ones, so a name like Iqbal is never caught by a fragment of it.
 */
const WORDS = [
  'fuck', 'fucker', 'fucking', 'shit', 'bitch', 'cunt', 'dick', 'cock', 'pussy', 'whore', 'slut', 'bastard', 'asshole', 'nigger', 'nigga', 'faggot', 'fag', 'retard', 'rape', 'rapist', 'nazi', 'hitler', 'porn', 'sex', 'penis', 'vagina', 'motherfucker',
  'magi', 'khanki', 'chudi', 'chuda', 'choda', 'chod', 'chodi', 'bal', 'baal', 'haramjada', 'haramzada', 'haramjadi', 'shuor', 'shuorer', 'kuttar', 'bainchod', 'banchod', 'madarchod', 'madarchud', 'bhosdi', 'gandu', 'randi',
]
const FRAGMENTS = ['fuck', 'shit', 'cunt', 'nigg', 'fagg', 'motherf', 'khanki', 'madarch', 'bainch', 'banch', 'haramj', 'haramz']
const BANGLA = ['মাগি', 'মাগী', 'খানকি', 'খানকী', 'চোদ', 'চুদ', 'বাল', 'হারামজাদা', 'হারামজাদি', 'শুয়োর', 'শূয়োর', 'কুত্তার', 'বেশ্যা', 'রান্ডি', 'বোকাচোদা']

function abusive(name: string) {
  const plain = name
    .toLowerCase()
    .replace(/[0@]/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/[$5]/g, 's')
  const words = plain.split(/[^\p{L}\p{M}]+/u).filter(Boolean)
  if (words.some((w) => WORDS.includes(w))) return true
  const squashed = plain.replace(/[^\p{L}]/gu, '')
  if (FRAGMENTS.some((f) => squashed.includes(f))) return true
  return BANGLA.some((b) => name.includes(b))
}

// ---- storage -------------------------------------------------------------------

async function readList(env: Env): Promise<Citizen[]> {
  const row = await env.DB.prepare("SELECT value FROM snapshot WHERE key = 'list'").first<{ value: string }>()
  try {
    return row ? (JSON.parse(row.value) as Citizen[]) : []
  } catch {
    return []
  }
}

async function writeList(env: Env, list: Citizen[]) {
  await env.DB.prepare("INSERT INTO snapshot (key, value) VALUES ('list', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(JSON.stringify(list)).run()
}

/** Rebuild the snapshot from the table: after a name is taken down. */
async function rebuild(env: Env) {
  const { results } = await env.DB.prepare('SELECT n, name FROM citizens WHERE hidden = 0 ORDER BY n LIMIT ?').bind(MAX_CITIZENS).all<Citizen>()
  await writeList(env, results)
  return results
}

async function ipHash(request: Request, env: Env) {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown'
  const day = new Date().toISOString().slice(0, 10)
  const data = new TextEncoder().encode(`${env.IP_SALT ?? 'silo'}|${day}|${ip}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ---- the handlers --------------------------------------------------------------

export const onRequestOptions = ({ request }: Ctx) => new Response(null, { status: 204, headers: cors(request) })

export async function onRequestGet({ request, env }: Ctx) {
  const list = await readList(env)
  return json(request, { citizens: list }, 200, { 'cache-control': 'public, max-age=30' })
}

export async function onRequestPost({ request, env }: Ctx) {
  let body: { name?: unknown }
  try {
    body = await request.json()
  } catch {
    return json(request, { error: 'That did not arrive as expected. Try again.' }, 400)
  }
  const name = clean(body.name)
  if (!name) return json(request, { error: 'A name of 2 to 40 letters, with spaces, full stops, apostrophes or hyphens.' }, 400)
  if (abusive(name)) return json(request, { error: 'That name cannot go on the wall.' }, 400)

  const hash = await ipHash(request, env)
  const now = Date.now()
  const recent = await env.DB.prepare('SELECT COUNT(*) AS c FROM joins WHERE ip_hash = ? AND at > ?').bind(hash, now - 60_000).first<{ c: number }>()
  if ((recent?.c ?? 0) >= 1) return json(request, { error: 'One name a minute, please. Try again shortly.' }, 429)
  const today = await env.DB.prepare('SELECT COUNT(*) AS c FROM joins WHERE ip_hash = ? AND at > ?').bind(hash, now - 86_400_000).first<{ c: number }>()
  if ((today?.c ?? 0) >= 3) return json(request, { error: 'Three names a day from one connection. Come back tomorrow.' }, 429)

  const list = await readList(env)
  if (list.length >= MAX_CITIZENS) return json(request, { error: 'The wall is full.' }, 409)

  const res = await env.DB.prepare('INSERT INTO citizens (name) VALUES (?)').bind(name).run()
  const citizen: Citizen = { n: res.meta.last_row_id, name }
  await writeList(env, [...list, citizen])
  await env.DB.prepare('INSERT INTO joins (ip_hash, at) VALUES (?, ?)').bind(hash, now).run()
  // Old spam-limit rows go: nothing is kept longer than it is needed.
  await env.DB.prepare('DELETE FROM joins WHERE at < ?').bind(now - 2 * 86_400_000).run()
  return json(request, { citizen }, 201)
}

export async function onRequestDelete({ request, env }: Ctx) {
  const auth = request.headers.get('authorization') ?? ''
  if (!env.ADMIN_TOKEN || auth !== `Bearer ${env.ADMIN_TOKEN}`) return json(request, { error: 'Not allowed.' }, 403)
  const n = Number(new URL(request.url).searchParams.get('n'))
  if (!Number.isInteger(n) || n < 1) return json(request, { error: 'Which number?' }, 400)
  await env.DB.prepare('UPDATE citizens SET hidden = 1 WHERE n = ?').bind(n).run()
  const list = await rebuild(env)
  return json(request, { removed: n, count: list.length })
}
