import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ARCADE_GAMES } from '../content/level6'
import { arcadeBlip } from '../lib/audio'
import { useSilo } from '../state/useSilo'

/**
 * The arcade in the recreation chamber: five cabinets, five games. Four are
 * classics of game theory, each played once -- one round, one choice -- and
 * then explained, because the point of each is what happens in a single
 * round. The fifth is a maze, with the rule that solves every maze like it.
 *
 * The other player is always the machine, and each game says plainly how
 * the machine chose. Nothing here claims to be data about real people.
 */

const rand = (n: number) => Math.floor(Math.random() * n)

function Explain({ children }: { children: React.ReactNode }) {
  return <div className="crt__explain">{children}</div>
}

function Again({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="crt__btn crt__btn--ghost" onClick={onClick}>
      Play again
    </button>
  )
}

// ---------------------------------------------------------------------------
// Prisoner's dilemma
// ---------------------------------------------------------------------------

type PD = 'silent' | 'confess'
const YEARS: Record<PD, Record<PD, [number, number]>> = {
  silent: { silent: [1, 1], confess: [3, 0] },
  confess: { silent: [0, 3], confess: [2, 2] },
}

function Prisoners() {
  const [mine, setMine] = useState<PD | null>(null)
  const [theirs, setTheirs] = useState<PD | null>(null)
  const choose = (c: PD) => {
    const t: PD = rand(2) ? 'silent' : 'confess'
    setMine(c)
    setTheirs(t)
    const [me, them] = YEARS[c][t]
    arcadeBlip(me < them ? 'win' : me > them ? 'lose' : 'even')
  }
  if (!mine || !theirs)
    return (
      <>
        <p>
          You and a partner are arrested and held apart. Each of you can <b>stay silent</b> or <b>confess</b>. You
          choose at the same moment, and neither sees the other’s choice.
        </p>
        <table className="crt__matrix">
          <thead>
            <tr>
              <th />
              <th>They stay silent</th>
              <th>They confess</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>You stay silent</th>
              <td>1 yr · 1 yr</td>
              <td>3 yrs · free</td>
            </tr>
            <tr>
              <th>You confess</th>
              <td>free · 3 yrs</td>
              <td>2 yrs · 2 yrs</td>
            </tr>
          </tbody>
        </table>
        <div className="crt__choices">
          <button type="button" className="crt__btn" onClick={() => choose('silent')}>
            Stay silent
          </button>
          <button type="button" className="crt__btn" onClick={() => choose('confess')}>
            Confess
          </button>
        </div>
      </>
    )
  const [me, them] = YEARS[mine][theirs]
  return (
    <>
      <p className="crt__result">
        You {mine === 'silent' ? 'stayed silent' : 'confessed'}. Your partner {theirs === 'silent' ? 'stayed silent' : 'confessed'}.
        <br />
        <b>You: {me === 0 ? 'free' : `${me} year${me > 1 ? 's' : ''}`}</b> · Partner: {them === 0 ? 'free' : `${them} year${them > 1 ? 's' : ''}`}
      </p>
      <Explain>
        <h3>What just happened</h3>
        <p>
          Look at it from your side. If your partner stays silent, confessing sets you free instead of serving a year.
          If they confess, confessing gets you two years instead of three. Whatever they do, confessing is better for
          you. It is a <b>dominant strategy</b>.
        </p>
        <p>
          The same is true for your partner, so two people reasoning carefully both confess and serve two years
          each. That is the game’s <b>Nash equilibrium</b>: neither can do better by changing only their own choice.
          Yet if both had stayed silent, both would have served one. Each choice is sensible on its own, and together
          they leave both players worse off.
        </p>
        <p>
          The same shape turns up in price wars, arms races and shared resources. When the game is played again and
          again with the same partner, cooperation can pay, because tomorrow’s partner remembers today.
        </p>
        <p className="crt__fine">Here your partner was the machine, choosing at random.</p>
      </Explain>
      <Again
        onClick={() => {
          setMine(null)
          setTheirs(null)
        }}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Ultimatum
// ---------------------------------------------------------------------------

function Ultimatum() {
  const [offer, setOffer] = useState(5)
  const [done, setDone] = useState<{ offer: number; min: number } | null>(null)
  const submit = () => {
    const min = 2 + rand(4)
    setDone({ offer, min })
    arcadeBlip(offer >= min ? 'win' : 'lose')
  }
  if (!done)
    return (
      <>
        <p>
          There are <b>10 credits</b> on the table. You propose how to split them, and the other player answers once.
          If they <b>accept</b>, the split stands. If they <b>reject</b>, nobody gets anything.
        </p>
        <label className="crt__slider">
          <span>
            Offer them <b>{offer}</b> and keep <b>{10 - offer}</b>
          </span>
          <input type="range" min={0} max={10} step={1} value={offer} onChange={(e) => setOffer(Number(e.target.value))} />
        </label>
        <div className="crt__choices">
          <button type="button" className="crt__btn" onClick={submit}>
            Make the offer
          </button>
        </div>
      </>
    )
  const ok = done.offer >= done.min
  return (
    <>
      <p className="crt__result">
        You offered {done.offer} of 10. They <b>{ok ? 'accepted' : 'rejected'}</b> it.
        <br />
        <b>You: {ok ? 10 - done.offer : 0}</b> · Them: {ok ? done.offer : 0}
      </p>
      <Explain>
        <h3>What just happened</h3>
        <p>
          On paper, the answer is cold. A responder who only cares about credits should take anything above zero,
          because one credit beats none. So the proposer should offer one and keep nine. That is the{' '}
          <b>subgame-perfect equilibrium</b>, found by reasoning backwards from the last move.
        </p>
        <p>
          People don’t play it that way. In experiments, responders often turn down offers they find unfair, giving
          up something to punish the proposer, and proposers often offer close to half. The game shows that{' '}
          <b>fairness has a price</b>, and that people will pay it.
        </p>
        <p className="crt__fine">
          Here the responder was the machine, with a hidden minimum it would accept: this time, {done.min}.
        </p>
      </Explain>
      <Again onClick={() => setDone(null)} />
    </>
  )
}

// ---------------------------------------------------------------------------
// Stag hunt
// ---------------------------------------------------------------------------

type SH = 'stag' | 'hare'
function Stag() {
  const [res, setRes] = useState<{ me: SH; them: SH } | null>(null)
  const pay = (a: SH, b: SH) => (a === 'hare' ? 2 : b === 'stag' ? 4 : 0)
  const choose = (me: SH) => {
    const them: SH = rand(2) ? 'stag' : 'hare'
    setRes({ me, them })
    const p = pay(me, them)
    arcadeBlip(p === 4 ? 'win' : p === 0 ? 'lose' : 'even')
  }
  if (!res)
    return (
      <>
        <p>
          You and a partner go hunting. A <b>stag</b> feeds you well, but only if you both hunt it: alone, it gets
          away. A <b>hare</b> you can catch by yourself, whatever the other does.
        </p>
        <table className="crt__matrix">
          <thead>
            <tr>
              <th />
              <th>They hunt stag</th>
              <th>They hunt hare</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>You hunt stag</th>
              <td>4 · 4</td>
              <td>0 · 2</td>
            </tr>
            <tr>
              <th>You hunt hare</th>
              <td>2 · 0</td>
              <td>2 · 2</td>
            </tr>
          </tbody>
        </table>
        <div className="crt__choices">
          <button type="button" className="crt__btn" onClick={() => choose('stag')}>
            Hunt the stag
          </button>
          <button type="button" className="crt__btn" onClick={() => choose('hare')}>
            Catch a hare
          </button>
        </div>
      </>
    )
  return (
    <>
      <p className="crt__result">
        You went for the {res.me}. Your partner went for the {res.them}.
        <br />
        <b>You: {pay(res.me, res.them)}</b> · Partner: {pay(res.them, res.me)}
      </p>
      <Explain>
        <h3>What just happened</h3>
        <p>
          Unlike the prisoner’s dilemma, nothing here tempts you to betray anyone. Both hunting the stag is the best
          result for both of you, and it is stable: if your partner hunts stag, so should you. But both hunting hare is
          stable too: if your partner goes for hare, a stag hunted alone gets you nothing.
        </p>
        <p>
          So the game has <b>two Nash equilibria</b>. The stag is <b>payoff-dominant</b>: better for everyone. The
          hare is <b>risk-dominant</b>: safe whatever happens. Which one people land on depends on how much they{' '}
          <b>trust</b> each other. It is the game of every joint venture and every team that has to commit together.
        </p>
        <p className="crt__fine">Here your partner was the machine, choosing at random.</p>
      </Explain>
      <Again onClick={() => setRes(null)} />
    </>
  )
}

// ---------------------------------------------------------------------------
// Guess two thirds of the average
// ---------------------------------------------------------------------------

interface Crowd {
  who: string
  pick: number
}
/** Nine machine players, reasoning to different depths: some pick at random,
 *  some think one step ahead (about 33), some two (about 22), one three, and
 *  one goes all the way to zero. */
function crowd(): Crowd[] {
  const j = (v: number, by: number) => Math.max(0, Math.min(100, Math.round(v + (Math.random() * 2 - 1) * by)))
  return [
    { who: 'Random', pick: rand(101) },
    { who: 'Random', pick: rand(101) },
    { who: 'Random', pick: rand(101) },
    { who: 'One step', pick: j(33, 4) },
    { who: 'One step', pick: j(33, 4) },
    { who: 'Two steps', pick: j(22, 3) },
    { who: 'Two steps', pick: j(22, 3) },
    { who: 'Three steps', pick: j(15, 2) },
    { who: 'All the way', pick: 0 },
  ]
}

function Beauty() {
  const [guess, setGuess] = useState(50)
  const [res, setRes] = useState<{ others: Crowd[]; target: number; avg: number; won: boolean } | null>(null)
  const submit = () => {
    const others = crowd()
    const all = [guess, ...others.map((o) => o.pick)]
    const avg = all.reduce((a, b) => a + b, 0) / all.length
    const target = (avg * 2) / 3
    const best = Math.min(...all.map((v) => Math.abs(v - target)))
    const won = Math.abs(guess - target) === best
    setRes({ others, target, avg, won })
    arcadeBlip(won ? 'win' : 'lose')
  }
  if (!res)
    return (
      <>
        <p>
          Ten players each pick a whole number from <b>0 to 100</b>. Whoever comes closest to <b>two thirds of the
          average</b> of all ten picks wins.
        </p>
        <label className="crt__slider">
          <span>
            Your number: <b>{guess}</b>
          </span>
          <input type="range" min={0} max={100} step={1} value={guess} onChange={(e) => setGuess(Number(e.target.value))} />
        </label>
        <div className="crt__choices">
          <button type="button" className="crt__btn" onClick={submit}>
            Lock it in
          </button>
        </div>
      </>
    )
  const marks = [{ who: 'You', pick: guess }, ...res.others]
  return (
    <>
      <div className="crt__strip" aria-label="Every pick on a line from 0 to 100">
        {marks.map((m, i) => (
          <span key={i} className={`crt__mark${i === 0 ? ' is-you' : ''}`} style={{ left: `${m.pick}%` }} title={`${m.who}: ${m.pick}`} />
        ))}
        <span className="crt__target" style={{ left: `${res.target}%` }} title={`Target ${res.target.toFixed(1)}`} />
      </div>
      <p className="crt__result">
        Average {res.avg.toFixed(1)} · two thirds of it <b>{res.target.toFixed(1)}</b>. You picked {guess}:{' '}
        <b>{res.won ? 'you win' : 'not this time'}</b>.
      </p>
      <Explain>
        <h3>What just happened</h3>
        <p>
          If everyone picked at random the average would be about 50, so a sharp player picks 33. But if everyone is
          that sharp, the average is 33, so a sharper one picks 22. Then 15, then 10. Follow the chain all the way and
          you reach <b>0</b>, the only <b>Nash equilibrium</b>: no one can win by moving away from it if everyone
          else is there.
        </p>
        <p>
          Yet 0 rarely wins, because real players stop after a step or two. To win, you have to guess <b>how far the
          others will think</b>, not just think as far as you can. Economists call this <b>level-k reasoning</b>. Keynes
          compared markets to a contest of judging which faces <i>other judges</i> would find prettiest.
        </p>
        <p className="crt__fine">
          The other nine were the machine: three picked at random, two thought one step ahead, two thought two, one
          thought three, and one went all the way to zero.
        </p>
      </Explain>
      <Again onClick={() => setRes(null)} />
    </>
  )
}

// ---------------------------------------------------------------------------
// Maze run
// ---------------------------------------------------------------------------

const MW = 17
const MH = 11
/** Walls: bit 1 north, 2 east, 4 south, 8 west -- set means OPEN. */
function makeMaze() {
  const open = new Uint8Array(MW * MH)
  const seen = new Uint8Array(MW * MH)
  const stack = [0]
  seen[0] = 1
  const dirs = [
    [0, -1, 1, 4],
    [1, 0, 2, 8],
    [0, 1, 4, 1],
    [-1, 0, 8, 2],
  ]
  while (stack.length) {
    const c = stack[stack.length - 1]
    const x = c % MW
    const y = Math.floor(c / MW)
    const next = dirs.filter(([dx, dy]) => {
      const nx = x + dx
      const ny = y + dy
      return nx >= 0 && ny >= 0 && nx < MW && ny < MH && !seen[ny * MW + nx]
    })
    if (!next.length) {
      stack.pop()
      continue
    }
    const [dx, dy, bit, back] = next[rand(next.length)]
    const n = (y + dy) * MW + x + dx
    open[c] |= bit
    open[n] |= back
    seen[n] = 1
    stack.push(n)
  }
  return open
}
const BITS = [1, 2, 4, 8]
const STEP: Array<[number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
]

/** Keep your right hand on the wall: the path it walks from start to exit. */
function rightHand(open: Uint8Array) {
  let x = 0
  let y = 0
  let dir = 1
  const path: Array<[number, number]> = [[0, 0]]
  for (let i = 0; i < MW * MH * 4 && !(x === MW - 1 && y === MH - 1); i++) {
    for (const turn of [1, 0, 3, 2]) {
      const d = (dir + turn) % 4
      if (open[y * MW + x] & BITS[d]) {
        dir = d
        x += STEP[d][0]
        y += STEP[d][1]
        path.push([x, y])
        break
      }
    }
  }
  return path
}

const RUN_BEST = 'silo.mazerun.best'
const readBest = () => {
  try {
    const v = Number(localStorage.getItem(RUN_BEST))
    return v > 0 ? v : null
  } catch {
    return null
  }
}

function MazeRun() {
  const [maze, setMaze] = useState(makeMaze)
  const [pos, setPos] = useState<[number, number]>([0, 0])
  const [start, setStart] = useState<number | null>(null)
  const [done, setDone] = useState<number | null>(null)
  const [now, setNow] = useState(0)
  const [ghost, setGhost] = useState(0)
  const canvas = useRef<HTMLCanvasElement>(null)
  const path = useMemo(() => rightHand(maze), [maze])
  const best = useMemo(readBest, [done])

  const move = useCallback(
    (d: number) => {
      if (done !== null) return
      setPos(([x, y]) => {
        if (!(maze[y * MW + x] & BITS[d])) return [x, y]
        const nx = x + STEP[d][0]
        const ny = y + STEP[d][1]
        arcadeBlip('step')
        const t0 = start ?? performance.now()
        if (start === null) setStart(t0)
        if (nx === MW - 1 && ny === MH - 1) {
          const took = performance.now() - t0
          setDone(took)
          arcadeBlip('win')
          const b = readBest()
          if (b === null || took < b) {
            try {
              localStorage.setItem(RUN_BEST, String(Math.round(took)))
            } catch {
              // Storage blocked: the time still shows.
            }
          }
        }
        return [nx, ny]
      })
    },
    [maze, start, done],
  )

  useEffect(() => {
    const keys: Record<string, number> = { ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3 }
    const onKey = (e: KeyboardEvent) => {
      const d = keys[e.code]
      if (d === undefined) return
      e.preventDefault()
      move(d)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [move])

  useEffect(() => {
    if (start === null || done !== null) return
    const id = window.setInterval(() => setNow(performance.now()), 100)
    return () => window.clearInterval(id)
  }, [start, done])

  // The right-hand rule, walked out a cell at a time once asked for.
  useEffect(() => {
    if (ghost === 0 || ghost >= path.length) return
    const id = window.setTimeout(() => setGhost((g) => g + 1), 45)
    return () => window.clearTimeout(id)
  }, [ghost, path.length])

  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const g = c.getContext('2d')!
    const cs = Math.floor(Math.min(560, c.parentElement?.clientWidth ?? 560) / MW)
    c.width = cs * MW + 2
    c.height = cs * MH + 2
    g.fillStyle = '#05100c'
    g.fillRect(0, 0, c.width, c.height)
    g.fillStyle = 'rgba(242,201,76,0.25)'
    g.fillRect((MW - 1) * cs + 1, (MH - 1) * cs + 1, cs, cs)
    if (ghost > 0) {
      g.strokeStyle = 'rgba(127,232,242,0.7)'
      g.lineWidth = Math.max(2, cs * 0.18)
      g.beginPath()
      path.slice(0, ghost).forEach(([x, y], i) => {
        const px = x * cs + cs / 2 + 1
        const py = y * cs + cs / 2 + 1
        if (i === 0) g.moveTo(px, py)
        else g.lineTo(px, py)
      })
      g.stroke()
    }
    g.strokeStyle = '#7fe0c4'
    g.lineWidth = 2
    g.beginPath()
    for (let y = 0; y < MH; y++)
      for (let x = 0; x < MW; x++) {
        const o = maze[y * MW + x]
        const px = x * cs + 1
        const py = y * cs + 1
        if (!(o & 1)) {
          g.moveTo(px, py)
          g.lineTo(px + cs, py)
        }
        if (!(o & 8)) {
          g.moveTo(px, py)
          g.lineTo(px, py + cs)
        }
        if (y === MH - 1 && !(o & 4)) {
          g.moveTo(px, py + cs)
          g.lineTo(px + cs, py + cs)
        }
        if (x === MW - 1 && !(o & 2)) {
          g.moveTo(px + cs, py)
          g.lineTo(px + cs, py + cs)
        }
      }
    g.stroke()
    g.fillStyle = '#f2c94c'
    g.beginPath()
    g.arc(pos[0] * cs + cs / 2 + 1, pos[1] * cs + cs / 2 + 1, cs * 0.3, 0, Math.PI * 2)
    g.fill()
  }, [maze, pos, ghost, path])

  const fmt = (ms: number) => `${(ms / 1000).toFixed(1)} s`
  const reset = () => {
    setMaze(makeMaze())
    setPos([0, 0])
    setStart(null)
    setDone(null)
    setGhost(0)
  }
  return (
    <>
      <p>
        From the top left to the gold square, bottom right. Arrow keys or WASD, or the pad below.{' '}
        <span className="crt__fine">
          {done !== null ? `Done in ${fmt(done)}` : start !== null ? fmt(now - start) : 'The clock starts on your first move'}
          {best ? ` · best ${fmt(best)}` : ''}
        </span>
      </p>
      <div className="crt__maze">
        <canvas ref={canvas} aria-label="Maze" />
      </div>
      <div className="crt__pad" aria-label="Move">
        <button type="button" className="crt__btn" onClick={() => move(0)} aria-label="Up">↑</button>
        <button type="button" className="crt__btn" onClick={() => move(3)} aria-label="Left">←</button>
        <button type="button" className="crt__btn" onClick={() => move(2)} aria-label="Down">↓</button>
        <button type="button" className="crt__btn" onClick={() => move(1)} aria-label="Right">→</button>
      </div>
      <div className="crt__choices">
        <button type="button" className="crt__btn crt__btn--ghost" onClick={() => setGhost(1)}>
          Show the right-hand rule
        </button>
        <button type="button" className="crt__btn crt__btn--ghost" onClick={reset}>
          New maze
        </button>
      </div>
      {(done !== null || ghost > 0) && (
        <Explain>
          <h3>The rule that solves it</h3>
          <p>
            This is a <b>perfect maze</b>: there is exactly one route between any two squares, and no loops. In a maze
            like that, if you keep one hand on the wall and never let go, you are bound to reach the exit. The wall is
            one continuous line, and you are following it. The blue trail is that rule played out: it takes wrong turns
            and backs out of them, but it never fails.
          </p>
          <p>
            The hedge maze outside on the deck was cut the same way, so the rule works there too.
          </p>
        </Explain>
      )}
    </>
  )
}

const GAMES: Record<string, () => React.ReactElement> = {
  prisoners: Prisoners,
  ultimatum: Ultimatum,
  stag: Stag,
  beauty: Beauty,
  maze: MazeRun,
}

export default function ArcadePanel() {
  const open = useSilo((s) => s.panel === 'arcade')
  const game = useSilo((s) => s.arcadeGame)
  const openPanel = useSilo((s) => s.openPanel)
  const close = useSilo((s) => s.closePanel)
  if (!open) return null
  const meta = ARCADE_GAMES.find((g) => g.id === game) ?? ARCADE_GAMES[0]
  const Game = GAMES[meta.id]
  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label={`Arcade: ${meta.title}`}>
      <div className="sheet__panel sheet__panel--wide crt">
        <div className="sheet__head">
          <div>
            <p className="sheet__eyebrow">Recreation · the arcade</p>
            <h2>{meta.title}</h2>
          </div>
          <button type="button" className="btn btn--ghost" onClick={close}>
            Close
          </button>
        </div>
        <nav className="crt__tabs" aria-label="Cabinets">
          {ARCADE_GAMES.map((g) => (
            <button
              key={g.id}
              type="button"
              className={`crt__tab${g.id === meta.id ? ' is-on' : ''}`}
              onClick={() => openPanel('arcade', g.id)}
              aria-pressed={g.id === meta.id}
            >
              {g.title}
            </button>
          ))}
        </nav>
        <div className="crt__screen">
          <Game key={meta.id} />
        </div>
      </div>
    </div>
  )
}
