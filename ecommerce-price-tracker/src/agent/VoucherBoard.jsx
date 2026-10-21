import { money } from './format.js'

function ago(iso) {
  if (!iso) return 'never'
  const hours = Math.round((Date.now() - new Date(iso).getTime()) / 3600000)
  if (hours < 1) return 'within the hour'
  if (hours < 48) return `${hours}h ago`
  return `${Math.round(hours / 24)} days ago`
}

const day = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

function campaign(url) {
  try {
    const slug = (new URL(url).searchParams.get('wh_pid') ?? '').replace(/\/+$/, '').split('/').pop()
    return slug && slug !== 'home' ? slug.replace(/[-_]+/g, ' ') : null
  } catch {
    return null
  }
}

// The public Daraz vouchers the agent checks every answer against. Collected
// from Daraz's campaign pages (agent/vouchers.py) — product pages show none
// to a logged-out visitor, so store and personal vouchers can't be listed.
export default function VoucherBoard({ data, status }) {
  return (
    <section className="voucher-board" id="vouchers">
      <div className="panel-head">
        <div>
          <p className="eyebrow">What the agent checks against</p>
          <h2>Public Daraz vouchers right now</h2>
        </div>
        {data && <small className="match-note">Collected from Daraz campaign pages {ago(data.harvestedAt)}.</small>}
      </div>
      {status === 'error' && <p className="no-results">Couldn't load the voucher list.</p>}
      {data && data.results.length === 0 && (
        <p className="no-results">
          No public vouchers are live on Daraz's campaign pages at the moment. They return in bulk around sales like 11.11.
        </p>
      )}
      {data && data.results.length > 0 && (
        <ul className="voucher-list">
          {data.results.map((v, i) => (
            <li key={i}>
              <strong>{v.amount != null ? `${money(v.amount)} off` : `${v.percent}% off`}</strong>
              <span className="voucher-terms">
                {v.minSpend != null ? `on orders over ${money(v.minSpend)}` : 'no minimum'}
                {v.maxDiscount != null && ` · capped at ${money(v.maxDiscount)}`}
              </span>
              <span className="voucher-title">{v.title}</span>
              <span className="voucher-labels">
                {v.labels.map((l) => (
                  <b key={l}>{l}</b>
                ))}
              </span>
              <small>
                {v.validFrom && v.validTo ? `${day(v.validFrom)} – ${day(v.validTo)}` : v.validTo ? `until ${day(v.validTo)}` : ''}
                {campaign(v.sourceUrl) && ` · ${campaign(v.sourceUrl)} campaign`}
              </small>
            </li>
          ))}
        </ul>
      )}
      <p className="voucher-footnote">
        Store vouchers, new-user offers and Daraz Coins only show to a logged-in Daraz account, so they aren't here.
      </p>
    </section>
  )
}
