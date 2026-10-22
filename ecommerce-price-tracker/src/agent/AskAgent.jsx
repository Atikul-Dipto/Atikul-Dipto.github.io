import { useCallback, useEffect, useRef, useState } from 'react'
import { askAgent } from './api.js'
import { money } from './format.js'

// Two boxes on purpose: a product name is searched exactly as typed and never
// rewritten by the AI (long, specific titles are what it misreads); only the
// "what do you need" text is read by the AI.
const EXAMPLES = [
  { name: 'Jedel KL69 61 Keys RGB Mechanical Keyboard' },
  { name: 'Samsung Galaxy A36' },
  { details: 'phone under 25k with good camera' },
  { details: 'ভালো ব্যাটারি সহ ১৫০০০ টাকার মধ্যে ফোন' },
  { name: 'sony wh-1000xm5', details: 'under 25000' },
]
const RECENT_KEY = 'pricepulse:recent-asks-v2'

// The order the agent works in (worker/agent.ts). While waiting, the current
// step is estimated from typical timings; once the answer lands, the real
// per-step timings replace the estimate.
const STEPS = [
  { key: 'understand', short: 'read', label: 'Reading what you need', typicalMs: 1500 },
  { key: 'search', short: 'search', label: 'Searching Daraz live', typicalMs: 600 },
  { key: 'remember', short: 'memory', label: 'Checking the prices we remember', typicalMs: 250 },
  { key: 'check', short: 'vouchers', label: 'Checking vouchers against their terms', typicalMs: 50 },
]

const shortDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const seconds = (ms) => `${(ms / 1000).toFixed(1)}s`
const tidy = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const label = (ask) => [ask.name, ask.details].filter(Boolean).join(' — ') || ask.query || ''
const sameAsk = (a, b) => tidy(a.name).toLowerCase() === tidy(b.name).toLowerCase() && tidy(a.details).toLowerCase() === tidy(b.details).toLowerCase()

function loadRecent() {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(raw) ? raw.filter((a) => a && (typeof a.name === 'string' || typeof a.details === 'string')).slice(0, 6) : []
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

/** ?name=&details= (shareable answers); ?q= from older links is read as a product name. */
function askFromUrl() {
  const p = new URLSearchParams(window.location.search)
  return { name: p.get('name') ?? p.get('q') ?? '', details: p.get('details') ?? '' }
}

function setUrlAsk(ask) {
  const url = new URL(window.location.href)
  for (const key of ['q', 'name', 'details']) url.searchParams.delete(key)
  if (ask.name) url.searchParams.set('name', ask.name)
  if (ask.details) url.searchParams.set('details', ask.details)
  window.history.pushState(ask, '', url)
}

function Progress({ elapsed, readsDetails }) {
  // With no "what do you need" text there's nothing for the AI to read.
  const steps = readsDetails ? STEPS : STEPS.slice(1)
  const ends = steps.map((_, i) => steps.slice(0, i + 1).reduce((sum, s) => sum + s.typicalMs, 0))
  const current = ends.findIndex((end) => elapsed < end)
  const active = current === -1 ? steps.length - 1 : current
  return (
    <div className="agent-progress" role="status" aria-live="polite">
      <ol>
        {steps.map((step, index) => (
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
  const named = intent.mode === 'product'
  const wishes = []
  if (!named && intent.productType) wishes.push(intent.productType)
  if (intent.brand && !named) wishes.push(intent.brand)
  if (intent.minPrice && intent.maxPrice) wishes.push(`${money(intent.minPrice)}–${money(intent.maxPrice)}`)
  else if (intent.maxPrice) wishes.push(`up to ${money(intent.maxPrice)}`)
  else if (intent.minPrice) wishes.push(`from ${money(intent.minPrice)}`)
  const readBy = { llm: 'needs read by AI, budget checked against your words', rules: 'needs read by rules (AI busy)', typed: 'searched exactly as typed' }
  return (
    <p className="understood">
      <span>{named ? 'Searching for' : 'Looking for'}</span>
      {named && <b>“{intent.searchQuery}”</b>}
      {wishes.map((p) => (
        <b key={p}>{p}</b>
      ))}
      {intent.mustHave.map((f) => (
        <b key={f} className="feature">
          {f}
        </b>
      ))}
      <small>{readBy[intent.source]}</small>
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

function Seller({ listing }) {
  return (
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
  )
}

function MainCard({ result, eyebrow }) {
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
        <p className="eyebrow">{eyebrow}</p>
        <h2>{listing.name}</h2>
        <Seller listing={listing} />

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

/** Beneath the named product: the agent's best choice, or why the named one already is. */
function ChoicePanel({ choice, pick, exact }) {
  if (choice.kind === 'exact') {
    return (
      <div className="choice choice-same-as-asked">
        <span className="choice-tag">Best choice</span>
        <p>
          <strong>This one.</strong> {choice.reason}
        </p>
      </div>
    )
  }
  const { listing } = pick
  const saving = exact ? exact.finalPrice - pick.finalPrice : 0
  return (
    <div className="choice">
      <span className="choice-tag">{choice.kind === 'same' ? 'Best choice · same product' : 'Best choice for what you need'}</span>
      <div className="choice-row">
        <a href={listing.url} target="_blank" rel="noreferrer" className="choice-main">
          <strong>{listing.name}</strong>
          <Seller listing={listing} />
          <small>{choice.reason}</small>
        </a>
        <div className="choice-price">
          <strong>{money(pick.finalPrice)}</strong>
          {pick.bestVoucher && <small>with voucher · {money(listing.price)} before</small>}
          {saving > 0 && <b>{money(saving)} less</b>}
          <a className="buy-btn" href={listing.url} target="_blank" rel="noreferrer">
            Open ↗
          </a>
        </div>
      </div>
    </div>
  )
}

function ListingRows({ title, results }) {
  if (!results.length) return null
  return (
    <div className="others">
      <h3>{title}</h3>
      <ul>
        {results.map((r) => (
          <li key={r.listing.itemId}>
            <a href={r.listing.url} target="_blank" rel="noreferrer">
              <span className="other-name">{r.listing.name}</span>
              <span className="other-seller">
                {r.listing.seller}
                {r.listing.officialStore && ' · Daraz Mall'}
                {r.listing.rating ? ` · ★ ${r.listing.rating.toFixed(1)} (${r.listing.reviews})` : ' · no ratings yet'}
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
  )
}

function Answer({ answer }) {
  const named = answer.intent.mode === 'product'
  const choice = answer.bestChoice
  const main = answer.results[0] ?? null
  const pick = choice ? (choice.kind === 'alternative' ? answer.alternatives[choice.index] : answer.results[choice.index]) : null

  const notes = []
  if (main && answer.intent.mustHave.length) {
    const missing = answer.intent.mustHave.filter((f) => !main.listing.matchedFeatures.includes(f))
    if (main.listing.matchedFeatures.length) notes.push(`The listing mentions: ${main.listing.matchedFeatures.join(', ')}.`)
    if (missing.length) notes.push(`Not mentioned in the listing, check the specs: ${missing.join(', ')}.`)
  }
  if (answer.skippedSuspicious) {
    notes.push(`Left out ${answer.skippedSuspicious} listing${answer.skippedSuspicious > 1 ? 's' : ''} priced far below the rest — usually parts, accessories, copies or placeholder prices.`)
  }
  if (main) notes.push(...main.hints)

  // Product mode: other sellers of the named product (minus the one shown as
  // best choice), then similar items. Need mode: the runners-up.
  const otherSellers = answer.results.filter((_, i) => i !== 0 && !(choice?.kind === 'same' && i === choice.index))
  const similar = answer.alternatives.filter((_, i) => !(choice?.kind === 'alternative' && i === choice.index))

  return (
    <section className="answer" aria-live="polite">
      <Understood intent={answer.intent} />

      {main ? (
        <>
          <MainCard result={main} eyebrow={named ? 'The product you asked for' : 'Best pick for what you described'} />
          {named && choice && pick && <ChoicePanel choice={choice} pick={pick} exact={main} />}
          {notes.length > 0 && (
            <ul className="agent-notes">
              {notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          <VoucherChecks checks={main.vouchers} />
        </>
      ) : (
        <>
          <div className="no-answer">
            <strong>{named ? 'Not in stock on Daraz right now.' : 'No match to recommend.'}</strong>
            <p>
              {answer.seen
                ? `Daraz returned ${answer.seen} results for “${answer.intent.searchQuery}”, but none is an in-stock listing of it — they were accessories, other models, or sold out.`
                : `Nothing on Daraz matched “${answer.intent.searchQuery}” right now.`}
            </p>
          </div>
          {choice && pick && <ChoicePanel choice={choice} pick={pick} exact={null} />}
        </>
      )}

      <ListingRows title={named ? 'Other sellers of it' : 'Also worth a look'} results={otherSellers} />
      {named && <ListingRows title="Similar items" results={similar} />}

      <footer className="answer-meta">
        <span>
          Answered in <b>{seconds(answer.timingsMs.total)}</b>
          {STEPS.filter((s) => answer.timingsMs[s.key] != null && (s.key !== 'understand' || answer.intent.source !== 'typed')).map((s) => (
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
  const [form, setForm] = useState(askFromUrl)
  const [state, setState] = useState({ status: 'idle', answer: null, error: null, asked: null })
  const [elapsed, setElapsed] = useState(0)
  const [recent, setRecent] = useState(loadRecent)
  const controller = useRef(null)
  const nameRef = useRef(null)

  const run = useCallback((raw, { push = true } = {}) => {
    const ask = { name: tidy(raw.name), details: tidy(raw.details) }
    if ((ask.name + ask.details).length < 2) return
    controller.current?.abort()
    const ctrl = new AbortController()
    controller.current = ctrl
    setForm(ask)
    if (push) setUrlAsk(ask)
    setState({ status: 'asking', answer: null, error: null, asked: ask })
    const started = performance.now()
    setElapsed(0)
    const tick = window.setInterval(() => setElapsed(performance.now() - started), 100)
    askAgent(ask, ctrl.signal)
      .then((answer) => {
        setState({ status: 'done', answer, error: null, asked: ask })
        setRecent((list) => {
          const next = [ask, ...list.filter((x) => !sameAsk(x, ask))].slice(0, 6)
          saveRecent(next)
          return next
        })
      })
      .catch((error) => {
        if (error.name === 'AbortError') return
        setState({ status: 'error', answer: null, error: error.message || "Couldn't reach the agent.", asked: ask })
      })
      .finally(() => window.clearInterval(tick))
  }, [])

  // A shared link opens straight onto its answer; back/forward replays them.
  useEffect(() => {
    const initial = askFromUrl()
    if (initial.name || initial.details) run(initial, { push: false })
    const onPop = () => {
      const ask = askFromUrl()
      if (ask.name || ask.details) run(ask, { push: false })
      else {
        controller.current?.abort()
        setForm({ name: '', details: '' })
        setState({ status: 'idle', answer: null, error: null, asked: null })
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [run])

  const asking = state.status === 'asking'
  const chips = recent.length ? recent : EXAMPLES
  const ready = (tidy(form.name) + tidy(form.details)).length >= 2

  return (
    <section className="ask" id="ask">
      <div className="ask-head">
        <p className="eyebrow">Shopping agent · Daraz</p>
        <h1>
          Name it, or describe it.
          <br />
          <em>Get the best price</em> in seconds.
        </h1>
        <p className="ask-copy">
          Type the product's name and you get exactly that product first, with the best choice beneath it. Add what you
          need, in English or বাংলা, and the agent weighs that too. It searches Daraz live, remembers the price it saw
          last time, and checks which public vouchers really fit.
        </p>
      </div>

      <form
        className="ask-form"
        onSubmit={(event) => {
          event.preventDefault()
          run(form)
        }}
      >
        <div className="ask-field">
          <label htmlFor="ask-name">Product name</label>
          <input
            id="ask-name"
            ref={nameRef}
            value={form.name}
            onChange={(event) => setForm((f) => ({ ...f, name: event.target.value }))}
            placeholder="e.g. Jedel KL69 61 Keys RGB Mechanical Keyboard"
            autoComplete="off"
            enterKeyHint="search"
            maxLength={200}
          />
          <small>Searched exactly as you type it.</small>
        </div>
        <div className="ask-field">
          <label htmlFor="ask-details">
            What do you need? <span>optional</span>
          </label>
          <input
            id="ask-details"
            value={form.details}
            onChange={(event) => setForm((f) => ({ ...f, details: event.target.value }))}
            placeholder="e.g. under 25k, good camera — or ১৫০০০ টাকার মধ্যে ভালো ব্যাটারি"
            autoComplete="off"
            enterKeyHint="search"
            maxLength={300}
          />
          <small>Features and budget. On its own, the agent finds the best match for it.</small>
        </div>
        <div className="ask-actions">
          <button type="submit" className="ask-submit" disabled={asking || !ready}>
            {asking ? 'Finding…' : 'Find it'}
          </button>
          {(form.name || form.details) && !asking && (
            <button
              type="button"
              className="ask-reset"
              onClick={() => {
                setForm({ name: '', details: '' })
                nameRef.current?.focus()
              }}
            >
              Clear
            </button>
          )}
        </div>
      </form>

      <div className="ask-chips">
        <span>{recent.length ? 'Recent' : 'Try'}</span>
        {chips.map((ask) => (
          <button type="button" key={label(ask)} onClick={() => run(ask)} disabled={asking}>
            {ask.name && <b>{ask.name}</b>}
            {ask.name && ask.details && ' · '}
            {ask.details}
          </button>
        ))}
      </div>

      {stats?.totals?.asks > 0 && (
        <p className="ask-record">
          {stats.totals.asks.toLocaleString('en-US')} questions answered so far · average {seconds(stats.totals.avg_ms ?? 0)} ·{' '}
          {(stats.tracked?.listings ?? 0).toLocaleString('en-US')} Daraz products in its price memory
        </p>
      )}

      {asking && <Progress elapsed={elapsed} readsDetails={Boolean(state.asked?.details)} />}
      {state.status === 'error' && (
        <div className="agent-error" role="alert">
          <strong>The agent couldn't answer “{label(state.asked)}”.</strong>
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
