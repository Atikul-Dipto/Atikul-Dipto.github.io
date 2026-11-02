// DorAI on a Daraz, Cartup or Othoba product page: a small panel with the same
// product on the other store, a cheaper trusted seller if there is one, and
// the lowest price DorAI has seen. Both stores change pages without reloading,
// so the address is watched rather than read once.
const SITE = 'https://atikul-islam-portfolio.pages.dev'
const PRODUCT = /daraz\.com\.bd\/products\/[^?#]*-i\d+[^?#]*\.html|cartup\.com\/product\/[^?#/]+|othoba\.com\/[a-z0-9][a-z0-9-]*\/?$/i

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
  font: 13px/1.45 system-ui, -apple-system, 'Segoe UI', sans-serif; color: #2e1a36; background: #fffaf0;
  border: 1px solid #ecdcd3; border-radius: 10px; box-shadow: 0 12px 34px rgba(46,26,54,.18); }
.head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #ecdcd3; cursor: pointer; }
.logo { display: block; width: 24px; height: 24px; border-radius: 6px; }
.head strong { flex: 1; font-size: 14px; color: #80426e; }
.head strong b { color: #522d60; }
.head button { all: unset; cursor: pointer; color: #8c7a90; padding: 0 4px; font-size: 15px; }
.verdict { padding: 12px; }
.verdict b { display: block; font-size: 15px; }
.verdict.cheaper b { color: #522d60; }
.verdict span { color: #74607a; }
.store { padding: 10px 12px; border-top: 1px solid #ecdcd3; }
.store h4 { margin: 0 0 6px; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: #80426e; }
.row { display: flex; gap: 8px; align-items: baseline; padding: 3px 0; }
.row .price { flex: none; font-weight: 700; }
.row a, .row .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #4a3150; text-decoration: none; }
.row a:hover { color: #80426e; }
.tag { flex: none; font-size: 10px; color: #8c7a90; }
.note { color: #8c7a90; font-size: 12px; }
.memory { padding: 10px 12px; border-top: 1px solid #ecdcd3; color: #74607a; font-size: 12px; }
.foot { display: block; padding: 10px 12px; border-top: 1px solid #ecdcd3; color: #80426e; text-decoration: none; font-size: 12px; font-weight: 600; }
.pill { position: fixed; right: 18px; bottom: 18px; z-index: 2147483647; display: flex; align-items: center; gap: 8px; padding: 7px 12px 7px 7px;
  font: 600 12px system-ui, -apple-system, 'Segoe UI', sans-serif; color: #2e1a36; background: #fffaf0; border: 1px solid #ecdcd3;
  border-radius: 999px; box-shadow: 0 8px 24px rgba(46,26,54,.16); cursor: pointer; }
.pill.cheaper { border-color: #522d60; }
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

/**
 * The price this page shows now. Stores apply campaign prices with their own
 * scripts after the page loads (Cartup's "Big Brand Days": the page arrives
 * saying ৳198, then shows ৳194), so the price the shopper sees is read from
 * the page itself: the first ৳ amount after the title that isn't struck out.
 */
function pagePrice() {
  const title = document.querySelector('h1')
  if (!title) return null
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.children.length || !(title.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)) continue
    const m = /^\s*৳\s*([\d,]+(?:\.\d+)?)\s*$/.exec(node.textContent)
    if (!m) continue
    const style = getComputedStyle(node)
    if (style.textDecorationLine.includes('line-through') || node.closest('del, s, strike') || style.display === 'none') continue
    return Number(m[1].replace(/,/g, ''))
  }
  return null
}

/** The answer with this page's own listing at the price the page shows, and what's cheaper worked out from it. */
function atPagePrice(answer, shown) {
  const sourceId = answer.source.listing.itemId
  if (!shown || shown === answer.source.finalPrice) return answer
  const adjust = (r) => (r && r.listing.itemId === sourceId ? { ...r, finalPrice: shown, shownOnPage: true } : r)
  const stores = answer.stores.map((s) => ({ ...s, recommended: adjust(s.recommended), matches: s.matches.map(adjust) }))
  const best = stores
    .filter((s) => s.recommended && s.recommended.listing.itemId !== sourceId)
    .sort((a, b) => a.recommended.finalPrice - b.recommended.finalPrice)[0]
  const saving = best ? shown - best.recommended.finalPrice : 0
  return { ...answer, stores, source: adjust(answer.source), cheaper: best && saving > 0 ? { site: best.site, label: best.label, saving } : null }
}

function verdict(answer) {
  const source = answer.source.listing
  if (answer.cheaper) {
    const store = answer.stores.find((s) => s.site === answer.cheaper.site)
    const where = answer.cheaper.site === source.site ? 'from another seller here' : `on ${answer.cheaper.label}`
    return { cheaper: true, short: `${money(answer.cheaper.saving)} cheaper ${where}`, line: `${money(store.recommended.finalPrice)} ${where}`, sub: `Save ${money(answer.cheaper.saving)} on the same product.` }
  }
  // A store that couldn't be checked: no claim about the best price.
  const unchecked = answer.stores.filter((s) => (answer.unreachable ?? []).includes(s.site)).map((s) => s.label)
  if (unchecked.length) {
    const line = `Couldn't check ${unchecked.join(' or ')} just now`
    return { cheaper: false, short: line, line, sub: 'Try again in a few minutes.' }
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
    root.append(el('div', { class: 'pill' }, logo(), el('span', { text: 'DorAI is checking…' })))
    return
  }
  if (answer.error) {
    root.append(el('div', { class: 'pill', title: answer.error, onclick: () => remove() }, logo(), el('span', { text: answer.error })))
    return
  }
  const v = verdict(answer)
  if (!open) {
    root.append(el('div', { class: `pill${v.cheaper ? ' cheaper' : ''}`, onclick: () => ((open = true), render()) }, logo(), el('span', { text: v.short })))
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
        logo(),
        el('strong', {}, 'দর', el('b', { text: 'AI' })),
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

const logo = () => el('img', { class: 'logo', src: chrome.runtime.getURL('icons/icon-48.png'), alt: 'DorAI' })

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
  const match = PRODUCT.exec(location.href.split(/[?#]/)[0])
  // Othoba's categories share its products' address shape; only a page with product data is a product.
  if (!match || (location.hostname.endsWith('othoba.com') && !structuredName())) return current && remove()
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
    current.answer = answer && !answer.error ? atPagePrice(answer, pagePrice()) : (answer ?? { error: "Couldn't reach DorAI just now." })
    open = Boolean(current.answer.cheaper)
    render()
  })
}

check()
setInterval(check, 1000)
