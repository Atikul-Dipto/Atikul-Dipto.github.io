// DorAI on a Daraz or Cartup product page: a small panel with the same
// product on the other store, a cheaper trusted seller if there is one, and
// the lowest price DorAI has seen. Both stores change pages without reloading,
// so the address is watched rather than read once.
const SITE = 'https://atikul-islam-portfolio.pages.dev'
const PRODUCT = /daraz\.com\.bd\/products\/[^?#]*-i\d+[^?#]*\.html|cartup\.com\/product\/[^?#/]+/i

const money = (v) => `৳${Math.round(v).toLocaleString('en-US')}`
// The agent's bar for a seller worth trusting (worker/ranking.ts `trusted`).
const trusted = (l) => l.officialStore || ((l.rating ?? 0) >= 4 && l.reviews >= 5) || (l.sellerPositive ?? 0) >= 90
const day = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

/** An element from plain values only: text is set as text, never parsed as HTML. */
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') node.textContent = v
    else if (k === 'onclick') node.addEventListener('click', v)
    else node.setAttribute(k, v)
  }
  for (const child of children.flat()) if (child) node.append(child)
  return node
}

const STYLE = `
:host { all: initial; }
.box { position: fixed; right: 18px; bottom: 18px; z-index: 2147483647; width: 330px; max-height: 70vh; overflow: auto;
  font: 13px/1.45 system-ui, -apple-system, 'Segoe UI', sans-serif; color: #eef2f5; background: #14191e;
  border: 1px solid #2a333b; border-radius: 10px; box-shadow: 0 12px 34px rgba(0,0,0,.35); }
.head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #2a333b; cursor: pointer; }
.logo { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 6px; background: #ffb347; color: #15191d; font-weight: 800; }
.head strong { flex: 1; font-size: 13px; }
.head button { all: unset; cursor: pointer; color: #8c98a3; padding: 0 4px; font-size: 15px; }
.verdict { padding: 12px; }
.verdict b { display: block; font-size: 15px; }
.verdict.cheaper b { color: #82e6b5; }
.verdict span { color: #a7b2bc; }
.store { padding: 10px 12px; border-top: 1px solid #2a333b; }
.store h4 { margin: 0 0 6px; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: #ffb347; }
.row { display: flex; gap: 8px; align-items: baseline; padding: 3px 0; }
.row .price { flex: none; font-weight: 700; }
.row a, .row .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #d3dbe2; text-decoration: none; }
.row a:hover { color: #ffb347; }
.tag { flex: none; font-size: 10px; color: #8c98a3; }
.note { color: #8c98a3; font-size: 12px; }
.memory { padding: 10px 12px; border-top: 1px solid #2a333b; color: #a7b2bc; font-size: 12px; }
.foot { display: block; padding: 10px 12px; border-top: 1px solid #2a333b; color: #ffb347; text-decoration: none; font-size: 12px; }
.pill { position: fixed; right: 18px; bottom: 18px; z-index: 2147483647; display: flex; align-items: center; gap: 8px; padding: 7px 12px 7px 7px;
  font: 600 12px system-ui, -apple-system, 'Segoe UI', sans-serif; color: #eef2f5; background: #14191e; border: 1px solid #2a333b;
  border-radius: 999px; box-shadow: 0 8px 24px rgba(0,0,0,.3); cursor: pointer; }
.pill.cheaper { border-color: #82e6b5; }
`

let host = null
let open = true
let current = null // { link, answer }

function mount() {
  if (!host) {
    host = el('div', { id: 'dorai-panel' })
    host.attachShadow({ mode: 'open' }).append(el('style', { text: STYLE }))
  }
  // Cartup's page redraws itself as it loads and can sweep the panel away; it's put back.
  if (!host.isConnected) (document.body ?? document.documentElement).append(host)
  return host.shadowRoot
}

function remove() {
  host?.remove()
  host = null
  current = null
}

function verdict(answer) {
  const source = answer.source.listing
  if (answer.cheaper) {
    const store = answer.stores.find((s) => s.site === answer.cheaper.site)
    const where = answer.cheaper.site === source.site ? 'from another seller here' : `on ${answer.cheaper.label}`
    return { cheaper: true, short: `${money(answer.cheaper.saving)} cheaper ${where}`, line: `${money(store.recommended.finalPrice)} ${where}`, sub: `Save ${money(answer.cheaper.saving)} on the same product.` }
  }
  const other = answer.stores.find((s) => s.site !== source.site && s.recommended)
  const sub = other ? `${other.label} has it for ${money(other.recommended.finalPrice)}.` : `Not found on ${answer.stores.filter((s) => s.site !== source.site).map((s) => s.label).join(' or ')} right now.`
  return { cheaper: false, short: 'Best price we found', line: 'This is the best price we found', sub }
}

function render() {
  const root = mount()
  for (const node of [...root.children]) if (node.tagName !== 'STYLE') node.remove()
  const { link, answer } = current
  if (!answer) {
    root.append(el('div', { class: 'pill' }, el('span', { class: 'logo', text: 'D' }), el('span', { text: 'DorAI is checking…' })))
    return
  }
  if (answer.error) {
    root.append(el('div', { class: 'pill', title: answer.error, onclick: () => remove() }, el('span', { class: 'logo', text: 'D' }), el('span', { text: answer.error })))
    return
  }
  const v = verdict(answer)
  if (!open) {
    root.append(el('div', { class: `pill${v.cheaper ? ' cheaper' : ''}`, onclick: () => ((open = true), render()) }, el('span', { class: 'logo', text: 'D' }), el('span', { text: v.short })))
    return
  }
  const source = answer.source
  const history = source.history
  root.append(
    el(
      'div',
      { class: 'box' },
      el(
        'div',
        { class: 'head', onclick: () => ((open = false), render()) },
        el('span', { class: 'logo', text: 'D' }),
        el('strong', { text: 'DorAI' }),
        el('button', { title: 'Minimise', text: '–' }),
      ),
      el('div', { class: `verdict${v.cheaper ? ' cheaper' : ''}` }, el('b', { text: v.line }), el('span', { text: v.sub })),
      answer.stores.map((s) =>
        el(
          'div',
          { class: 'store' },
          el('h4', { text: s.label }),
          s.recommended
            ? row(s.recommended, s.recommended.listing.itemId === source.listing.itemId ? 'this page' : 'best offer')
            : el('div', { class: 'note', text: s.note ?? 'Not found.' }),
          s.matches
            .filter((m) => m.relation === 'same' || m.relation === 'variant')
            .slice(0, 3)
            .map((m) =>
              row(m, m.listing.itemId === source.listing.itemId ? 'this page' : m.relation === 'variant' ? 'other size' : trusted(m.listing) ? 'other seller' : 'unrated seller'),
            ),
        ),
      ),
      history && history.checks > 1
        ? el('div', {
            class: 'memory',
            text: `Lowest we've seen: ${money(history.lowestPrice)} · ${history.checks} checks since ${day(history.firstSeen)}`,
          })
        : null,
      el('a', { class: 'foot', href: `${SITE}/price-pulse/?link=${encodeURIComponent(link)}`, target: '_blank', rel: 'noopener', text: 'Full comparison on DorAI →' }),
    ),
  )
}

function row(result, tag) {
  return el(
    'div',
    { class: 'row' },
    el('span', { class: 'price', text: money(result.finalPrice) }),
    el('a', { href: result.listing.url, target: '_blank', rel: 'noopener', title: result.listing.name, text: result.listing.name }),
    el('span', { class: 'tag', text: tag }),
  )
}

/** The page's own product data (schema.org), when it has it. */
function structuredName() {
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(script.textContent)
      const product = [data, ...(data['@graph'] ?? [])].find((d) => d?.['@type'] === 'Product')
      if (product?.name) return String(product.name).trim()
    } catch {
      // not JSON: skip
    }
  }
  return null
}

/**
 * The product's name as the page has it (a better search than the address),
 * once it has loaded: its product data first — Cartup's <h1> runs the brand
 * link into the name ("RadhuniRadhuni Mustard Oil") — then the heading.
 */
async function readName() {
  for (let i = 0; i < 10; i++) {
    const name = structuredName() ?? document.querySelector('h1')?.textContent?.trim()
    if (name) return name
    await new Promise((r) => setTimeout(r, 300))
  }
  return document.querySelector('meta[property="og:title"]')?.getAttribute('content') ?? ''
}

async function check() {
  const match = PRODUCT.exec(location.href)
  if (!match) return current && remove()
  const link = location.href.split(/[?#]/)[0]
  if (current?.link === link) {
    if (host && !host.isConnected) mount()
    return
  }
  current = { link, answer: null }
  render()
  const name = await readName()
  chrome.runtime.sendMessage({ type: 'compare', link, name }, (answer) => {
    if (current?.link !== link) return // moved on to another product meanwhile
    current.answer = answer ?? { error: "Couldn't reach DorAI just now." }
    open = Boolean(current.answer.cheaper)
    render()
  })
}

check()
setInterval(check, 1000)
