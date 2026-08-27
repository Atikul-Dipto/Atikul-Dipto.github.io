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
  const [query, setQuery] = useState('')
  const [store, setStore] = useState('All stores')
  const [sort, setSort] = useState('Biggest discount')
  const [watching, setWatching] = useState(loadWatchlist)

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}products.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json()
      })
      .then((raw) => {
        setProducts(normalize(raw))
        setStatus('ready')
      })
      .catch(() => setStatus('error'))
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
          <a href="#watchlist">
            Watchlist <b>{watching.length}</b>
          </a>
          <a href="#sources">Sources</a>
        </nav>
        <div className="sync">
          <i />
          {status === 'ready' ? `Data as of ${timeAgo(lastSync)}` : status === 'error' ? 'Data unavailable' : 'Loading data…'}
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
