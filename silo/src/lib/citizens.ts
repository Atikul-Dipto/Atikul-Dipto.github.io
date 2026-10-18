/**
 * The citizens of the Silo: names visitors have added, shown to everyone on
 * the wall of the citizens' room.
 *
 * Kept by a small Cloudflare Pages Function (functions/api/citizens.ts at the
 * site root) in a D1 database, on the Cloudflare copy of the site; the GitHub
 * Pages copy calls it there. Nothing here invents a name or pretends one was
 * added: if the register cannot be reached, the room says so.
 */

// Development talks to the preview deployment's copy of the function.
const API = import.meta.env.DEV ? 'https://preview.atikul-islam-portfolio.pages.dev/api/citizens' : 'https://atikul-islam-portfolio.pages.dev/api/citizens'

export interface Citizen {
  /** The citizen's number, in order of joining. */
  n: number
  name: string
}

export const citizens = {
  list: [] as Citizen[],
  /** null until the first answer; false if the register could not be reached. */
  reachable: null as boolean | null,
  loadedAt: 0,
  /** Bumped whenever the list changes, so the wall knows to redraw. */
  version: 0,
  /** This visitor's own number, once they have joined (kept on this device). */
  mine: null as number | null,
}

const MINE_KEY = 'silo.citizen'
try {
  const v = JSON.parse(localStorage.getItem(MINE_KEY) ?? 'null')
  if (v && typeof v.n === 'number') citizens.mine = v.n
} catch {
  // Storage blocked: the visitor just is not remembered.
}

let inflight: Promise<void> | null = null

/** Fetch the register, at most once a minute unless forced. */
export function loadCitizens(force = false) {
  if (inflight) return inflight
  if (!force && performance.now() - citizens.loadedAt < 60_000 && citizens.reachable !== null) return Promise.resolve()
  inflight = fetch(API, { headers: { accept: 'application/json' } })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((data: { citizens: Citizen[] }) => {
      citizens.list = Array.isArray(data.citizens) ? data.citizens : []
      citizens.reachable = true
    })
    .catch(() => {
      citizens.reachable = false
    })
    .finally(() => {
      citizens.loadedAt = performance.now()
      citizens.version++
      inflight = null
    })
  return inflight
}

/** The same rules the register applies, so the form can say why before sending. */
export function checkName(raw: string): string | null {
  const name = raw.normalize('NFC').replace(/\s+/g, ' ').trim()
  if (name.length < 2) return 'A name needs at least two letters.'
  if (name.length > 40) return 'Forty characters at most.'
  if (!/^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u.test(name)) return 'Letters, spaces, full stops, apostrophes and hyphens only.'
  return null
}

export type JoinResult = { ok: true; citizen: Citizen } | { ok: false; reason: string }

/** Add a name to the register. */
export async function joinCitizens(raw: string): Promise<JoinResult> {
  const problem = checkName(raw)
  if (problem) return { ok: false, reason: problem }
  const name = raw.normalize('NFC').replace(/\s+/g, ' ').trim()
  try {
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ name }),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok || !data.citizen) return { ok: false, reason: data.error ?? 'The register could not take the name just now. Try again in a little while.' }
    const c: Citizen = data.citizen
    citizens.list = [...citizens.list.filter((x) => x.n !== c.n), c].sort((a, b) => a.n - b.n)
    citizens.mine = c.n
    citizens.version++
    try {
      localStorage.setItem(MINE_KEY, JSON.stringify(c))
    } catch {
      // Not remembered on this device; still on the wall.
    }
    return { ok: true, citizen: c }
  } catch {
    return { ok: false, reason: 'The register could not be reached. Check the connection and try again.' }
  }
}
