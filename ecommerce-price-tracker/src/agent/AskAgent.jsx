import { useCallback, useEffect, useRef, useState } from 'react'
import { askAgent } from './api.js'
import { money } from './format.js'

const EXAMPLES = [
  'Samsung Galaxy A36',
  'phone under 25k with good camera',
  'ভালো ব্যাটারি সহ ১৫০০০ টাকার মধ্যে ফোন',
  'miniket rice 5kg',
  'sony wh-1000xm5',
]
const RECENT_KEY = 'pricepulse:recent-asks'

// The order the agent works in (worker/agent.ts). While waiting, the current
// step is estimated from typical timings; once the answer lands, the real
// per-step timings replace the estimate.
const STEPS = [
  { key: 'understand', short: 'read', label: 'Reading your request', typicalMs: 1500 },
  { key: 'search', short: 'search', label: 'Searching Daraz live', typicalMs: 600 },
  { key: 'remember', short: 'memory', label: 'Checking the prices we remember', typicalMs: 250 },
  { key: 'check', short: 'vouchers', label: 'Checking vouchers against their terms', typicalMs: 50 },
]

const shortDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const seconds = (ms) => `${(ms / 1000).toFixed(1)}s`

function loadRecent() {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(raw) ? raw.filter((q) => typeof q === 'string').slice(0, 6) : []
  } catch {
    return []
  }
}

function saveRecent(list) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list))
  } catch {
    // Storage blocked: recent searches just aren't remembered.
  }
}

const queryFromUrl = () => new URLSearchParams(window.location.search).get('q') ?? ''

function setUrlQuery(query, replace = false) {
  const url = new URL(window.location.href)
  if (query) url.searchParams.set('q', query)
  else url.searchParams.delete('q')
  window.history[replace ? 'replaceState' : 'pushState']({ q: query }, '', url)
}

function Progress({ elapsed }) {
  const ends = STEPS.map((_, i) => STEPS.slice(0, i + 1).reduce((sum, s) => sum + s.typicalMs, 0))
  const current = ends.findIndex((end) => elapsed < end)
  const active = current === -1 ? STEPS.length - 1 : current
  return (
    <div className="agent-progress" role="status" aria-live="polite">
      <ol>
        {STEPS.map((step, index) => (
          <li key={step.key} className={index < active ? 'done' : index === active ? 'active' : ''}>
            <i aria-hidden="true" />
            {step.label}
          </li>
        ))}
      </ol>
      <span className="agent-timer">{seconds(elapsed)}</span>
    </div>
  )
}

function Understood({ intent }) {
  const parts = [intent.mode === 'need' ? 'Looking for' : 'Named product']
  if (intent.mode === 'need' && intent.productType) parts.push(intent.productType)
  if (intent.mode === 'product') parts.push(`“${intent.searchQuery}”`)
  if (intent.brand && intent.mode === 'need') parts.push(intent.brand)
  if (intent.minPrice && intent.maxPrice) parts.push(`${money(intent.minPrice)}–${money(intent.maxPrice)}`)
  else if (intent.maxPrice) parts.push(`up to ${money(intent.maxPrice)}`)
  else if (intent.minPrice) parts.push(`from ${money(intent.minPrice)}`)
  return (
    <p className="understood">
      <span>Understood as</span>
      {parts.map((p) => (
        <b key={p}>{p}</b>
      ))}
      {intent.mustHave.map((f) => (
        <b key={f} className="feature">
          {f}
        </b>
      ))}
      <small>{intent.source === 'llm' ? 'read by AI, budget checked against your words' : 'read by rules (AI busy)'}</small>
    </p>
  )
}

function PriceMemory({ listing, history }) {
  if (!history) {
    return (
      <div className="memory">
        <span>Price memory</span>
        <strong>New</strong>
        <small>First time we've seen it. Saved for next time.</small>
      </div>
    )
  }
  const diff = listing.price - history.lastPrice
  return (
    <div className="memory">
      <span>Last time we checked</span>
      <strong>{money(history.lastPrice)}</strong>
      <small className={diff < 0 ? 'down' : diff > 0 ? 'up' : ''}>
        {diff === 0 ? 'No change' : `${diff < 0 ? '↓' : '↑'} ${money(Math.abs(diff))}`} since {shortDate(history.lastSeen)} · lowest{' '}
        {money(history.lowestPrice)} · {history.checks} check{history.checks === 1 ? '' : 's'}
      </small>
    </div>
  )
}

const STATUS_LABEL = { applies: 'Applies', conditional: 'Applies if…', not_applicable: "Doesn't apply" }

function VoucherChecks({ checks }) {
  if (!checks.length) return null
  return (
    <div className="voucher-checks">
      <h4>Vouchers checked</h4>
      <ul>
        {checks.map((c, i) => (
          <li key={i} className={c.status}>
            <div>
              <b>{c.voucher.title}</b>
              <span>
                {c.voucher.amount != null ? `${money(c.voucher.amount)} off` : `${c.voucher.percent}% off`}
                {c.voucher.minSpend != null && ` · min ${money(c.voucher.minSpend)}`}
              </span>
              <em>{STATUS_LABEL[c.status]}</em>
            </div>
            <ul>
              {[...c.reasons, ...c.conditions].map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  )
}

function BestCard({ result }) {
  const { listing, history, bestVoucher, finalPrice } = result
  const [imgOk, setImgOk] = useState(true)
  return (
    <article className="best-card">
      <div className="best-media">
        {listing.image && imgOk ? (
          <img src={listing.image} alt="" referrerPolicy="no-referrer" onError={() => setImgOk(false)} />
        ) : (
          <span>{listing.name.slice(0, 2)}</span>
        )}
      </div>
      <div className="best-body">
        <p className="eyebrow">Best deal on Daraz</p>
        <h2>{listing.name}</h2>
        <p className="seller">
          {listing.seller}
          {listing.officialStore && <b className="mall">Daraz Mall</b>}
          {listing.rating ? (
            <span>
              ★ {listing.rating.toFixed(1)} ({listing.reviews})
            </span>
          ) : (
            <span>No ratings yet</span>
          )}
          {listing.sold && <span>{listing.sold}</span>}
        </p>

        <div className="price-grid">
          <div>
            <span>Price now</span>
            <strong>{money(listing.price)}</strong>
            {listing.originalPrice ? (
              <small>
                <del>{money(listing.originalPrice)}</del> {listing.discountPercent}% off
              </small>
            ) : (
              <small>No listed discount</small>
            )}
          </div>
          <div className={bestVoucher ? 'with-voucher' : ''}>
            <span>With best voucher</span>
            <strong>{bestVoucher ? money(finalPrice) : '—'}</strong>
            <small>{bestVoucher ? `${bestVoucher.voucher.title} −${money(bestVoucher.saving)}` : 'No public voucher fits'}</small>
          </div>
          <PriceMemory listing={listing} history={history} />
        </div>

        {bestVoucher?.conditions.length > 0 && (
          <div className="conditions">
            <span>Only if</span>
            <ul>
              {bestVoucher.conditions.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        )}

        <a className="buy-btn best-buy" href={listing.url} target="_blank" rel="noreferrer">
          Open on Daraz ↗
        </a>
      </div>
    </article>
  )
}

function Answer({ answer }) {
  const best = answer.bestIndex != null ? answer.results[answer.bestIndex] : null
  const others = answer.results.filter((_, i) => i !== answer.bestIndex)
  const notes = []
  if (best && answer.intent.mustHave.length) {
    const missing = answer.intent.mustHave.filter((f) => !best.listing.matchedFeatures.includes(f))
    if (best.listing.matchedFeatures.length) notes.push(`The listing mentions: ${best.listing.matchedFeatures.join(', ')}.`)
    if (missing.length) notes.push(`Not mentioned in the listing, check the specs: ${missing.join(', ')}.`)
  }
  if (answer.skippedSuspicious) {
    notes.push(`Left out ${answer.skippedSuspicious} listing${answer.skippedSuspicious > 1 ? 's' : ''} priced far below the rest — usually parts, accessories, copies or placeholder prices.`)
  }
  if (best) notes.push(...best.hints)

  return (
    <section className="answer" aria-live="polite">
      <Understood intent={answer.intent} />

      {best ? (
        <>
          <BestCard result={best} />
          {notes.length > 0 && (
            <ul className="agent-notes">
              {notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          <VoucherChecks checks={best.vouchers} />
        </>
      ) : (
        <div className="no-answer">
          <strong>No match to recommend.</strong>
          <p>{answer.summary}</p>
        </div>
      )}

      {others.length > 0 && (
        <div className="others">
          <h3>{answer.intent.mode === 'need' ? 'Also worth a look' : 'Other listings of it'}</h3>
          <ul>
            {others.map((r) => (
              <li key={r.listing.itemId}>
                <a href={r.listing.url} target="_blank" rel="noreferrer">
                  <span className="other-name">{r.listing.name}</span>
                  <span className="other-seller">
                    {r.listing.seller}
                    {r.listing.officialStore && ' · Daraz Mall'}
                    {r.listing.rating ? ` · ★ ${r.listing.rating.toFixed(1)} (${r.listing.reviews})` : ''}
                  </span>
                </a>
                <div className="other-price">
                  <strong>{money(r.listing.price)}</strong>
                  {r.bestVoucher && <small>{money(r.finalPrice)} with voucher</small>}
                  {r.history && r.history.lastPrice !== r.listing.price && (
                    <small className={r.listing.price < r.history.lastPrice ? 'down' : 'up'}>was {money(r.history.lastPrice)}</small>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <footer className="answer-meta">
        <span>
          Answered in <b>{seconds(answer.timingsMs.total)}</b>
          {STEPS.filter((s) => answer.timingsMs[s.key] != null).map((s) => (
            <i key={s.key}>
              {s.short} {seconds(answer.timingsMs[s.key])}
            </i>
          ))}
          {answer.timingsMs.scope != null && <i>narrow down {seconds(answer.timingsMs.scope)}</i>}
        </span>
        <a href={answer.searchUrl} target="_blank" rel="noreferrer">
          Daraz's own results ↗
        </a>
      </footer>

      <details className="caveats">
        <summary>What the agent can and can't check</summary>
        <ul>
          {answer.caveats.map((c) => (
            <li key={c}>{c}</li>
          ))}
          {answer.database !== 'ok' && answer.database !== 'not needed' && <li>Price memory was unreachable for this answer.</li>}
        </ul>
      </details>
    </section>
  )
}

export default function AskAgent({ stats }) {
  const [query, setQuery] = useState(queryFromUrl)
  const [state, setState] = useState({ status: 'idle', answer: null, error: null, asked: '' })
  const [elapsed, setElapsed] = useState(0)
  const [recent, setRecent] = useState(loadRecent)
  const controller = useRef(null)
  const inputRef = useRef(null)

  const run = useCallback((raw, { push = true } = {}) => {
    const q = raw.replace(/\s+/g, ' ').trim()
    if (q.length < 2) return
    controller.current?.abort()
    const ctrl = new AbortController()
    controller.current = ctrl
    setQuery(q)
    if (push) setUrlQuery(q)
    setState({ status: 'asking', answer: null, error: null, asked: q })
    const started = performance.now()
    setElapsed(0)
    const tick = window.setInterval(() => setElapsed(performance.now() - started), 100)
    askAgent(q, ctrl.signal)
      .then((answer) => {
        setState({ status: 'done', answer, error: null, asked: q })
        setRecent((list) => {
          const next = [q, ...list.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 6)
          saveRecent(next)
          return next
        })
      })
      .catch((error) => {
        if (error.name === 'AbortError') return
        setState({ status: 'error', answer: null, error: error.message || "Couldn't reach the agent.", asked: q })
      })
      .finally(() => window.clearInterval(tick))
  }, [])

  // A ?q= link opens straight onto its answer; back/forward replays them.
  useEffect(() => {
    const initial = queryFromUrl()
    if (initial) run(initial, { push: false })
    const onPop = () => {
      const q = queryFromUrl()
      if (q) run(q, { push: false })
      else {
        controller.current?.abort()
        setQuery('')
        setState({ status: 'idle', answer: null, error: null, asked: '' })
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [run])

  const asking = state.status === 'asking'
  const chips = recent.length ? recent : EXAMPLES

  return (
    <section className="ask" id="ask">
      <div className="ask-head">
        <p className="eyebrow">Shopping agent · Daraz</p>
        <h1>
          Say what you want.
          <br />
          <em>Get the best price</em> in seconds.
        </h1>
        <p className="ask-copy">
          Name a product or describe what you need, in English or বাংলা. The agent searches Daraz live, remembers the
          price it saw last time, and checks which public vouchers really fit.
        </p>
      </div>

      <form
        className="ask-form"
        onSubmit={(event) => {
          event.preventDefault()
          run(query)
        }}
      >
        <label htmlFor="ask-input" className="visually-hidden">
          What are you shopping for?
        </label>
        <input
          id="ask-input"
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="e.g. phone under 25k with good camera"
          autoComplete="off"
          enterKeyHint="search"
          maxLength={200}
        />
        {query && !asking && (
          <button
            type="button"
            className="ask-clear"
            aria-label="Clear"
            onClick={() => {
              setQuery('')
              inputRef.current?.focus()
            }}
          >
            ✕
          </button>
        )}
        <button type="submit" className="ask-submit" disabled={asking || query.trim().length < 2}>
          {asking ? 'Finding…' : 'Find it'}
        </button>
      </form>

      <div className="ask-chips">
        <span>{recent.length ? 'Recent' : 'Try'}</span>
        {chips.map((q) => (
          <button type="button" key={q} onClick={() => run(q)} disabled={asking}>
            {q}
          </button>
        ))}
      </div>

      {stats?.totals?.asks > 0 && (
        <p className="ask-record">
          {stats.totals.asks.toLocaleString('en-US')} questions answered so far · average {seconds(stats.totals.avg_ms ?? 0)} ·{' '}
          {(stats.tracked?.listings ?? 0).toLocaleString('en-US')} Daraz products in its price memory
        </p>
      )}

      {asking && <Progress elapsed={elapsed} />}
      {state.status === 'error' && (
        <div className="agent-error" role="alert">
          <strong>The agent couldn't answer “{state.asked}”.</strong>
          <p>{state.error}</p>
          <button type="button" className="outline-btn" onClick={() => run(state.asked, { push: false })}>
            Try again
          </button>
        </div>
      )}
      {state.status === 'done' && state.answer && <Answer answer={state.answer} />}
    </section>
  )
}
