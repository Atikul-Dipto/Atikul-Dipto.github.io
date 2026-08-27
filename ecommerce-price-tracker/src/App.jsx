import { useEffect, useMemo, useState } from 'react'
import './App.css'

const STORE_META = {
  daraz: { label: 'Daraz', color: '#ffb347' },
  othoba: { label: 'Othoba', color: '#64d4ff' },
  shwapno: { label: 'Shwapno', color: '#82e6b5' },
  startech: { label: 'Star Tech', color: '#cf9cff' },
  bikroy: { label: 'Bikroy', color: '#ff8e8e' },
  cartup: { label: 'Cartup', color: '#f2dc71' },
  packly: { label: 'Packly', color: '#9fd3c7' },
  chaldal: { label: 'Chaldal', color: '#f4a6c6' },
}
const FALLBACK_COLORS = ['#ffb347', '#64d4ff', '#82e6b5', '#cf9cff', '#ff8e8e', '#f2dc71']
const storeMeta = (site) =>
  STORE_META[site] ?? {
    label: site ? site[0].toUpperCase() + site.slice(1) : 'Unknown',
    color: FALLBACK_COLORS[site ? site.charCodeAt(0) % FALLBACK_COLORS.length : 0],
  }

const WATCHLIST_KEY = 'pricepulse:watchlist'
const money = (value) => `৳${new Intl.NumberFormat('en-US').format(value)}`

function timeAgo(iso) {
  if (!iso) return 'unknown'
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.round(diffMs / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

function loadWatchlist() {
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

// --- Cross-platform product matching -----------------------------------
// There's no shared product ID across 6 unrelated storefronts, so "the same
// product on two sites" can only be inferred from name text. Getting this
// wrong actively misleads a shopper (a false "cheaper elsewhere" is worse
// than not showing a comparison at all), so matching is deliberately
// layered with hard gates rather than a single similarity score:
//   1. Quantity notation is normalized ("500 gm" / "500gm" -> "500gm")
//      so real matches aren't missed on formatting alone.
//   2. Brand gate: the FIRST word of a listing title is almost always the
//      brand in these catalogs ("PRAN Full Cream Milk Powder" / "AMA Full
//      Cream Milk Powder") — two names must share it, or they don't group,
//      no matter how similar the rest of the words look.
//   3. Quantity gate: if BOTH names carry a detected size/weight token,
//      it must match too — otherwise a 500g pack and a 1kg pack of the
//      same brand would be shown as directly comparable, which they aren't.
//   4. Only past both gates does word-overlap (Jaccard) get a vote, and it
//      still has to clear MATCH_THRESHOLD.
// Net effect: this errs toward showing nothing over showing a wrong match.
const STOPWORDS = new Set([
  'with', 'for', 'and', 'the', 'a', 'an', 'of', 'to', 'by', 'in', 'on', 'is', 'are', 'this', 'that',
])
const QUANTITY_UNITS = 'kg|g|gm|gram|grams|l|ltr|litre|liter|ml|pcs|pc|pack'
const QUANTITY_RE = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${QUANTITY_UNITS})\\b`, 'gi')
const QUANTITY_TOKEN_RE = new RegExp(`^\\d+(${QUANTITY_UNITS})$`)

function tokenize(name) {
  return name
    .replace(QUANTITY_RE, '$1$2')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((token) => token.length > 1 && !STOPWORDS.has(token))
}

function quantityToken(tokens) {
  return tokens.find((token) => QUANTITY_TOKEN_RE.test(token)) ?? null
}

function jaccard(a, b) {
  let intersection = 0
  for (const token of a) if (b.has(token)) intersection++
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

const MATCH_THRESHOLD = 0.6

function groupAcrossStores(products) {
  const groups = []
  for (const product of products) {
    const tokenList = tokenize(product.name)
    if (tokenList.length < 2) continue
    const brand = tokenList[0]
    const quantity = quantityToken(tokenList)
    const tokens = new Set(tokenList)

    let best = null
    let bestScore = 0
    for (const group of groups) {
      if (group.brand !== brand) continue
      if (group.quantity && quantity && group.quantity !== quantity) continue
      const score = jaccard(tokens, group.tokens)
      if (score > bestScore) {
        bestScore = score
        best = group
      }
    }
    if (best && bestScore >= MATCH_THRESHOLD) {
      best.items.push(product)
    } else {
      groups.push({ brand, quantity, tokens, items: [product] })
    }
  }
  return groups
    .map((group) => ({ items: [...group.items].sort((a, b) => a.price - b.price) }))
    .filter((group) => new Set(group.items.map((item) => item.store)).size >= 2)
    .sort((a, b) => b.items.length - a.items.length)
}

function normalize(raw) {
  return raw
    .map((row) => {
      const price = Number(row.current_price)
      if (!Number.isFinite(price) || price <= 0) return null
      const original = Number(row.original_price)
      const previous = Number(row.previous_price)
      const discount = Number(row.discount_percent)
      return {
        id: row.source_url,
        site: row.site,
        store: storeMeta(row.site).label,
        color: storeMeta(row.site).color,
        name: row.product_name,
        price,
        original: Number.isFinite(original) && original > price ? original : null,
        previous: Number.isFinite(previous) && previous > 0 ? previous : null,
        discount: Number.isFinite(discount) && discount > 0 ? discount : null,
        url: row.source_url,
        scrapedAt: row.scraped_at,
      }
    })
    .filter(Boolean)
}

export default function App() {
  const [status, setStatus] = useState('loading')
  const [products, setProducts] = useState([])
  const [banners, setBanners] = useState([])
  const [query, setQuery] = useState('')
  const [store, setStore] = useState('All stores')
  const [sort, setSort] = useState('Biggest discount')
  const [watching, setWatching] = useState(loadWatchlist)
  const [lastChecked, setLastChecked] = useState(null)

  useEffect(() => {
    let cancelled = false
    const loadProducts = () => {
      fetch(`${import.meta.env.BASE_URL}products.json?t=${Date.now()}`, { cache: 'no-store' })
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          return response.json()
        })
        .then((raw) => {
          if (cancelled) return
          setProducts(normalize(raw))
          setLastChecked(new Date())
          setStatus('ready')
        })
        .catch(() => {
          if (!cancelled) setStatus('error')
        })
    }

    loadProducts()
    const refreshTimer = window.setInterval(loadProducts, 5 * 60 * 1000)
    return () => {
      cancelled = true
      window.clearInterval(refreshTimer)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const loadBanners = () => {
      fetch(`${import.meta.env.BASE_URL}banners.json?t=${Date.now()}`, { cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : []))
        .then((raw) => {
          if (!cancelled) setBanners(Array.isArray(raw) ? raw : [])
        })
        .catch(() => {
          if (!cancelled) setBanners([])
        })
    }

    loadBanners()
    const refreshTimer = window.setInterval(loadBanners, 5 * 60 * 1000)
    return () => {
      cancelled = true
      window.clearInterval(refreshTimer)
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(WATCHLIST_KEY, JSON.stringify(watching))
    } catch {
      // localStorage unavailable (private mode, etc.) — watchlist just won't persist
    }
  }, [watching])

  const stores = useMemo(() => [...new Set(products.map((p) => p.store))].sort(), [products])

  const filtered = useMemo(
    () =>
      products
        .filter(
          (p) =>
            p.name.toLowerCase().includes(query.toLowerCase()) &&
            (store === 'All stores' || p.store === store),
        )
        .sort((a, b) => {
          if (sort === 'Lowest price') return a.price - b.price
          if (sort === 'Highest price') return b.price - a.price
          if (sort === 'Newest') return new Date(b.scrapedAt) - new Date(a.scrapedAt)
          return (b.discount ?? 0) - (a.discount ?? 0)
        }),
    [products, query, store, sort],
  )

  const toggleWatch = (id) =>
    setWatching((items) => (items.includes(id) ? items.filter((item) => item !== id) : [...items, id]))

  const watchedProducts = useMemo(() => products.filter((p) => watching.includes(p.id)), [products, watching])
  const topDeals = useMemo(
    () =>
      [...products]
        .filter((p) => p.discount)
        .sort((a, b) => b.discount - a.discount)
        .slice(0, 5),
    [products],
  )
  const priceDrops = useMemo(() => products.filter((p) => p.previous && p.previous > p.price), [products])
  const avgDiscount = useMemo(() => {
    const withDiscount = products.filter((p) => p.discount)
    if (!withDiscount.length) return null
    return withDiscount.reduce((sum, p) => sum + p.discount, 0) / withDiscount.length
  }, [products])
  const lastSync = useMemo(
    () => products.reduce((latest, p) => (!latest || p.scrapedAt > latest ? p.scrapedAt : latest), null),
    [products],
  )

  const bannersByStore = useMemo(() => {
    const grouped = new Map()
    for (const banner of banners) {
      const meta = storeMeta(banner.site)
      const list = grouped.get(meta.label) ?? { store: meta.label, color: meta.color, items: [] }
      list.items.push(banner)
      grouped.set(meta.label, list)
    }
    return [...grouped.values()].sort((a, b) => a.store.localeCompare(b.store))
  }, [banners])

  const crossStoreGroups = useMemo(() => groupAcrossStores(products), [products])

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/">
          price<span>pulse</span>
        </a>
        <nav>
          <a className="active" href="#overview">
            Overview
          </a>
          <a href="#compare">
            Compare <b>{crossStoreGroups.length}</b>
          </a>
          <a href="#banners">Deals & banners</a>
          <a href="#watchlist">
            Watchlist <b>{watching.length}</b>
          </a>
          <a href="#sources">Sources</a>
        </nav>
        <div className="sync">
          <i />
          {status === 'ready' ? `Data as of ${timeAgo(lastSync)} · checked ${lastChecked ? lastChecked.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}` : status === 'error' ? 'Data unavailable' : 'Loading data…'}
        </div>
      </header>

      <section className="intro" id="overview">
        <div>
          <p className="eyebrow">Bangladesh marketplace monitor</p>
          <h1>
            Find the moment
            <br />
            <em>before</em> the price moves.
          </h1>
          <p className="intro-copy">
            Real listings scraped from Bangladeshi online stores, refreshed on demand. Search, filter, and click
            straight through to buy — no fabricated ratings or stock counts, just what each store's page actually
            shows.
          </p>
        </div>
        <div className="intro-note">
          <span>Tracked right now</span>
          <strong>{products.length}</strong>
          <small>products across {stores.length || 0} sources</small>
        </div>
      </section>

      {status === 'error' && (
        <section className="empty-state">
          <strong>Couldn't load product data.</strong>
          <p>
            Run the scraper to generate <code>public/products.json</code>, then reload:
          </p>
          <pre>python run_pipeline.py run</pre>
        </section>
      )}

      {status === 'ready' && products.length === 0 && (
        <section className="empty-state">
          <strong>No products tracked yet.</strong>
          <p>
            Run <code>python run_pipeline.py run</code> from <code>ecommerce-price-tracker/</code> to populate this
            dashboard.
          </p>
        </section>
      )}

      {status === 'ready' && products.length > 0 && (
        <>
          <section className="control-bar" aria-label="Product filters">
            <label className="search">
              <span>⌕</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products" />
            </label>
            <label>
              <span>Store</span>
              <select value={store} onChange={(event) => setStore(event.target.value)}>
                <option>All stores</option>
                {stores.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Sort by</span>
              <select value={sort} onChange={(event) => setSort(event.target.value)}>
                <option>Biggest discount</option>
                <option>Lowest price</option>
                <option>Highest price</option>
                <option>Newest</option>
              </select>
            </label>
            <span className="result-count">
              {filtered.length} of {products.length} shown
            </span>
          </section>

          <section className="metric-row">
            <div>
              <span>Average discount</span>
              <strong>{avgDiscount ? `${avgDiscount.toFixed(1)}%` : '—'}</strong>
              <small>Across listings with a discount</small>
            </div>
            <div>
              <span>Lowest tracked price</span>
              <strong>{money(Math.min(...products.map((p) => p.price)))}</strong>
              <small>Across all stores</small>
            </div>
            <div>
              <span>Price drops seen</span>
              <strong className={priceDrops.length ? 'up' : ''}>{priceDrops.length}</strong>
              <small>Since the previous scrape</small>
            </div>
            <div>
              <span>Stores monitored</span>
              <strong>{String(stores.length).padStart(2, '0')}</strong>
              <small>Live sources</small>
            </div>
          </section>

          {crossStoreGroups.length > 0 && (
            <section className="compare-panel" id="compare">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">Cross-platform comparison</p>
                  <h2>Same product, different stores</h2>
                </div>
                <small className="match-note">Matched by listing name similarity — double-check before buying.</small>
              </div>
              <div className="compare-list">
                {crossStoreGroups.map((group) => {
                  const cheapest = group.items[0]
                  const priciest = group.items[group.items.length - 1]
                  return (
                    <article className="compare-card" key={group.items.map((i) => i.id).join('|')}>
                      <h3>{cheapest.name}</h3>
                      <p className="compare-spread">
                        {group.items.length} stores · spreads {money(priciest.price - cheapest.price)}
                      </p>
                      <ul className="compare-rows">
                        {group.items.map((item, index) => (
                          <li key={item.id} className={index === 0 ? 'best' : ''}>
                            <span className="store-chip" style={{ '--product-color': item.color }}>
                              {item.store}
                            </span>
                            <span className="compare-name">{item.name}</span>
                            <strong>{money(item.price)}</strong>
                            {index === 0 && <b className="best-tag">Best price</b>}
                            <a href={item.url} target="_blank" rel="noreferrer">
                              Visit ↗
                            </a>
                          </li>
                        ))}
                      </ul>
                    </article>
                  )
                })}
              </div>
            </section>
          )}

          <section className="content-grid">
            <div className="product-panel">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">Live product feed</p>
                  <h2>Best current deals</h2>
                </div>
              </div>
              <div className="product-list">
                {filtered.map((product) => (
                  <article className="product" key={product.id}>
                    <div className="product-icon" style={{ '--product-color': product.color }}>
                      {product.name.slice(0, 2)}
                    </div>
                    <div className="product-info">
                      <h3>{product.name}</h3>
                      <p>
                        <span className="store-chip" style={{ '--product-color': product.color }}>
                          {product.store}
                        </span>
                        {product.previous && product.previous > product.price && (
                          <span className="price-move down">↓ was {money(product.previous)}</span>
                        )}
                        {product.previous && product.previous < product.price && (
                          <span className="price-move up">↑ was {money(product.previous)}</span>
                        )}
                      </p>
                    </div>
                    <div className="product-price">
                      <strong>{money(product.price)}</strong>
                      {product.original && <del>{money(product.original)}</del>}
                      {product.discount && <b>{Math.round(product.discount)}% off</b>}
                    </div>
                    <a className="buy-btn" href={product.url} target="_blank" rel="noreferrer">
                      Visit ↗
                    </a>
                    <button
                      type="button"
                      className={`watch-btn${watching.includes(product.id) ? ' watching' : ''}`}
                      onClick={() => toggleWatch(product.id)}
                      aria-label={`Watch ${product.name}`}
                    >
                      {watching.includes(product.id) ? '◆' : '◇'}
                    </button>
                  </article>
                ))}
                {filtered.length === 0 && <p className="no-results">No products match your filters.</p>}
              </div>
            </div>

            <aside className="side-panel" id="watchlist">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">Top deals</p>
                  <h2>Biggest discounts</h2>
                </div>
              </div>
              <ul className="deal-list">
                {topDeals.map((deal) => (
                  <li key={deal.id}>
                    <a href={deal.url} target="_blank" rel="noreferrer">
                      <span className="deal-name">{deal.name}</span>
                      <span className="deal-store">{deal.store}</span>
                    </a>
                    <b>{Math.round(deal.discount)}% off</b>
                  </li>
                ))}
                {topDeals.length === 0 && <li className="no-results">No discounted listings right now.</li>}
              </ul>

              <div className="panel-head watchlist-head">
                <div>
                  <p className="eyebrow">Your signal</p>
                  <h2>Watchlist</h2>
                </div>
                <span className="period">{watchedProducts.length} saved</span>
              </div>
              {watchedProducts.length === 0 ? (
                <div className="alert-box">
                  <span>◇</span>
                  <div>
                    <strong>Nothing watched yet</strong>
                    <small>Tap the ◇ on any product to track it here.</small>
                  </div>
                </div>
              ) : (
                <ul className="deal-list">
                  {watchedProducts.map((product) => (
                    <li key={product.id}>
                      <a href={product.url} target="_blank" rel="noreferrer">
                        <span className="deal-name">{product.name}</span>
                        <span className="deal-store">{product.store}</span>
                      </a>
                      <b>{money(product.price)}</b>
                    </li>
                  ))}
                </ul>
              )}
            </aside>
          </section>
        </>
      )}

      {bannersByStore.length > 0 && (
        <section className="banners-section" id="banners">
          <p className="eyebrow">Marketplace campaigns</p>
          <h2>Current offers &amp; banners, by store</h2>
          {bannersByStore.map((group) => (
            <div className="banner-row" key={group.store}>
              <h3>
                <span className="store-chip" style={{ '--product-color': group.color }}>
                  {group.store}
                </span>
                <small>{group.items.length} live</small>
              </h3>
              <div className="banner-strip">
                {group.items.map((banner, index) => (
                  <a
                    className="banner-card"
                    key={`${banner.site}-${index}`}
                    href={banner.link_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <img src={banner.image_url} alt={`${group.store} offer`} loading="lazy" />
                  </a>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      <footer id="sources">
        <span>Data scraped from public product pages — run the pipeline again for a fresh snapshot</span>
        <span>
          Built for price-aware shopping ·{' '}
          <a href="https://github.com/Atikul-Dipto" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </span>
      </footer>
    </main>
  )
}
