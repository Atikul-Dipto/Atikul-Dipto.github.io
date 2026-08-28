import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const STORE_META = {
  daraz: { label: 'Daraz', color: '#ffb347' },
  othoba: { label: 'Othoba', color: '#64d4ff' },
  shwapno: { label: 'Shwapno', color: '#82e6b5' },
  startech: { label: 'Star Tech', color: '#cf9cff' },
  cartup: { label: 'Cartup', color: '#f2dc71' },
  pickaboo: { label: 'Pickaboo', color: '#ff8e8e' },
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
const PAGE_SIZE = 24
const money = (value) => `৳${new Intl.NumberFormat('en-US').format(value)}`

// Windowed page numbers (first two, last two, current ± 1) so the control
// stays a fixed width instead of listing every page once there are dozens.
function pageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages = new Set([1, 2, current - 1, current, current + 1, total - 1, total])
  return [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)
}

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

const API_BASE = import.meta.env.VITE_API_BASE_URL

// --- Cross-platform product matching (offline fallback) -----------------
// The backend (backend/app/matching.py) computes this server-side now —
// this copy only runs when there's no live API to call (VITE_API_BASE_URL
// unset, or the API request fails), so the static-export build of this
// site keeps the comparison feature instead of silently losing it. Keep
// this in lockstep with matching.py if either one changes; it was ported
// there and verified to produce identical output on the same data.
//
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
        productId: row.id ?? null,
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

// --- Price history line chart --------------------------------------------
// Single-series "trend over time" (see dataviz skill: choosing-a-form.md).
// One hue, chosen by net direction (green = price fell or held, warm = price
// rose) rather than a fixed accent, since that's the one piece of identity
// worth carrying here — no legend needed for a single series. Hand-rolled
// SVG (no charting library in this project) with a real crosshair+tooltip
// per the skill's interaction spec, not a static image.
function PriceChart({ points }) {
  const width = 560
  const height = 200
  const padding = { top: 18, right: 16, bottom: 26, left: 16 }
  const [hoverIndex, setHoverIndex] = useState(null)
  const svgRef = useRef(null)

  if (points.length < 2) {
    return (
      <div className="chart-empty">
        <strong>Only {points.length} price point recorded so far.</strong>
        <small>Check back after the next scrape to see a trend line here.</small>
      </div>
    )
  }

  const prices = points.map((p) => Number(p.current_price))
  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)
  const flat = maxPrice === minPrice
  const priceRange = flat ? 1 : maxPrice - minPrice
  const times = points.map((p) => new Date(p.scraped_at).getTime())
  const minTime = times[0]
  const maxTime = times[times.length - 1]
  const timeRange = maxTime - minTime || 1

  const plotW = width - padding.left - padding.right
  const plotH = height - padding.top - padding.bottom
  const xFor = (t) => padding.left + ((t - minTime) / timeRange) * plotW
  const yFor = (p) => (flat ? padding.top + plotH / 2 : padding.top + plotH - ((p - minPrice) / priceRange) * plotH)

  const coords = points.map((p, i) => ({ x: xFor(times[i]), y: yFor(prices[i]), price: prices[i], at: p.scraped_at }))
  const pathD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ')
  const trendColor = prices[prices.length - 1] > prices[0] ? '#ff9d9d' : 'var(--green)'
  const last = coords[coords.length - 1]
  const active = hoverIndex != null ? coords[hoverIndex] : last

  const handleMove = (event) => {
    const rect = svgRef.current.getBoundingClientRect()
    const relX = ((event.clientX - rect.left) / rect.width) * width
    let nearest = 0
    let best = Infinity
    coords.forEach((c, i) => {
      const d = Math.abs(c.x - relX)
      if (d < best) {
        best = d
        nearest = i
      }
    })
    setHoverIndex(nearest)
  }

  const fmtDate = (iso) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="price-chart">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIndex(null)}
        role="img"
        aria-label={`Price history from ${money(minPrice)} to ${money(maxPrice)}`}
      >
        {[0, 0.5, 1].map((f) => {
          const y = padding.top + plotH * (1 - f)
          return <line key={f} x1={padding.left} x2={width - padding.right} y1={y} y2={y} className="chart-grid" />
        })}
        {!flat && (
          <>
            <text x={padding.left} y={padding.top - 6} className="chart-axis-value">{money(maxPrice)}</text>
            <text x={padding.left} y={height - padding.bottom + 14} className="chart-axis-value">{money(minPrice)}</text>
          </>
        )}
        <path d={pathD} fill="none" stroke={trendColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {active && (
          <line x1={active.x} x2={active.x} y1={padding.top} y2={height - padding.bottom} className="chart-crosshair" />
        )}
        <circle cx={last.x} cy={last.y} r="5" fill={trendColor} stroke="var(--panel)" strokeWidth="2" />
        {hoverIndex != null && hoverIndex !== coords.length - 1 && (
          <circle cx={active.x} cy={active.y} r="5" fill={trendColor} stroke="var(--panel)" strokeWidth="2" />
        )}
        <text x={last.x} y={last.y - 10} textAnchor="end" className="chart-end-label">{money(last.price)}</text>
      </svg>
      <div className="chart-axis-labels">
        <span>{fmtDate(points[0].scraped_at)}</span>
        {flat && <span className="chart-flat-note">No price change across {points.length} checks yet</span>}
        <span>{fmtDate(points[points.length - 1].scraped_at)}</span>
      </div>
      {active && (
        <div
          className="chart-tooltip"
          style={{ left: `${Math.min(Math.max((active.x / width) * 100, 12), 88)}%` }}
        >
          <strong>{money(active.price)}</strong>
          <small>{fmtDate(active.at)}</small>
        </div>
      )}
    </div>
  )
}

function ProductDetail({ product, history, historyStatus, trend, trendStatus, onClose }) {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="detail-backdrop" onClick={onClose}>
      <aside className="detail-panel" onClick={(event) => event.stopPropagation()} role="dialog" aria-label={product.name}>
        <button type="button" className="detail-close" onClick={onClose} aria-label="Close">✕</button>
        <span className="store-chip" style={{ '--product-color': product.color }}>{product.store}</span>
        <h2>{product.name}</h2>
        <div className="detail-price-row">
          <strong>{money(product.price)}</strong>
          {product.original && <del>{money(product.original)}</del>}
          {product.discount && <b>{Math.round(product.discount)}% off</b>}
        </div>

        {historyStatus === 'loading' && <div className="chart-empty"><small>Loading price history…</small></div>}
        {historyStatus === 'unavailable' && (
          <div className="chart-empty">
            <strong>Price history needs the live backend.</strong>
            <small>This snapshot only carries the current and previous price — run the FastAPI backend for the full trend line.</small>
          </div>
        )}
        {historyStatus === 'ready' && <PriceChart points={history} />}

        {trendStatus === 'loading' && (
          <div className="trend-loading">
            <span className="spinner" /> Reading the trend…
          </div>
        )}
        {trendStatus === 'ready' && trend && (
          <div className="trend-block">
            <div className="trend-stats">
              <div>
                <span>Since first tracked</span>
                <strong className={trend.direction}>
                  {trend.direction === 'flat' ? 'No change' : `${trend.direction === 'up' ? '↑' : '↓'} ${Math.abs(trend.change_pct)}%`}
                </strong>
              </div>
              <div>
                <span>Lowest seen</span>
                <strong>{money(trend.lowest_price)}</strong>
              </div>
              <div>
                <span>Highest seen</span>
                <strong>{money(trend.highest_price)}</strong>
              </div>
              <div>
                <span>Checks logged</span>
                <strong>{trend.checks}</strong>
              </div>
            </div>
            <div className="ai-recap">
              <span className="ai-tag">{trend.summary_source === 'model' ? 'AI recap' : 'Recap'}</span>
              <p>{trend.summary}</p>
            </div>
          </div>
        )}

        <a className="buy-btn detail-buy" href={product.url} target="_blank" rel="noreferrer">
          Visit on {product.store} ↗
        </a>
      </aside>
    </div>
  )
}

export default function App() {
  const [status, setStatus] = useState('loading')
  const [products, setProducts] = useState([])
  const [banners, setBanners] = useState([])
  const [query, setQuery] = useState('')
  const [store, setStore] = useState('All stores')
  const [sort, setSort] = useState('Biggest discount')
  const [page, setPage] = useState(1)
  const [watching, setWatching] = useState(loadWatchlist)
  const [lastChecked, setLastChecked] = useState(null)
  const [usingApi, setUsingApi] = useState(false)
  const [apiCompareGroups, setApiCompareGroups] = useState([])
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [history, setHistory] = useState([])
  const [historyStatus, setHistoryStatus] = useState('idle')
  const [trend, setTrend] = useState(null)
  const [trendStatus, setTrendStatus] = useState('idle')

  // Products + compare-groups: prefer the live backend when configured: it
  // has more data (the full Postgres history, not one committed snapshot)
  // and its /api/compare-groups is the canonical version of the matching
  // logic below. Fall back to the static public/products.json export —
  // and the local groupAcrossStores() — when there's no API_BASE or the
  // request fails, so the deployed static site (which has no backend)
  // keeps working exactly as it does today.
  useEffect(() => {
    let cancelled = false

    const loadFromApi = async () => {
      const response = await fetch(`${API_BASE}/api/products?limit=1000&sort=discount`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      if (cancelled) return true
      setProducts(normalize(data.results))
      setUsingApi(true)
      setLastChecked(new Date())
      setStatus('ready')

      fetch(`${API_BASE}/api/compare-groups`)
        .then((r) => (r.ok ? r.json() : { results: [] }))
        .then((groupsData) => {
          if (cancelled) return
          setApiCompareGroups(
            (groupsData.results || []).map((group) => ({
              items: group.items.map((item) => ({
                id: item.source_url,
                site: item.site,
                store: storeMeta(item.site).label,
                color: storeMeta(item.site).color,
                name: item.product_name,
                price: Number(item.current_price),
                url: item.source_url,
              })),
            })),
          )
        })
        .catch(() => {
          if (!cancelled) setApiCompareGroups([])
        })
      return true
    }

    const loadFromStaticExport = () =>
      fetch(`${import.meta.env.BASE_URL}products.json?t=${Date.now()}`, { cache: 'no-store' })
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          return response.json()
        })
        .then((raw) => {
          if (cancelled) return
          setProducts(normalize(raw))
          setUsingApi(false)
          setLastChecked(new Date())
          setStatus('ready')
        })

    const loadProducts = async () => {
      try {
        if (API_BASE && (await loadFromApi())) return
      } catch {
        // API unavailable — fall through to the static export below
      }
      try {
        await loadFromStaticExport()
      } catch {
        if (!cancelled) setStatus('error')
      }
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

    const loadFromApi = async () => {
      const response = await fetch(`${API_BASE}/api/banners`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      if (!cancelled) setBanners(Array.isArray(data.results) ? data.results : [])
      return true
    }

    const loadBanners = async () => {
      try {
        if (API_BASE && (await loadFromApi())) return
      } catch {
        // API unavailable — fall through to the static export below
      }
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}banners.json?t=${Date.now()}`, { cache: 'no-store' })
        const raw = response.ok ? await response.json() : []
        if (!cancelled) setBanners(Array.isArray(raw) ? raw : [])
      } catch {
        if (!cancelled) setBanners([])
      }
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

  // Price history is only available from the live API — the static export
  // only ever carries current + previous price, not the full series.
  useEffect(() => {
    if (!selectedProduct) return
    if (!usingApi || !API_BASE || !selectedProduct.productId) {
      setHistory([])
      setHistoryStatus('unavailable')
      return
    }
    let cancelled = false
    setHistoryStatus('loading')
    fetch(`${API_BASE}/api/products/${selectedProduct.productId}/history?limit=500`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json()
      })
      .then((data) => {
        if (cancelled) return
        setHistory(data.points || [])
        setHistoryStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setHistoryStatus('unavailable')
      })
    return () => {
      cancelled = true
    }
  }, [selectedProduct, usingApi])

  // Trend stats + AI recap — separate, slower fetch (the narration model
  // can take a few seconds on CPU), so it never blocks the chart from
  // showing. Backend-only, same reasoning as history above.
  useEffect(() => {
    if (!selectedProduct) return
    if (!usingApi || !API_BASE || !selectedProduct.productId) {
      setTrend(null)
      setTrendStatus('unavailable')
      return
    }
    let cancelled = false
    setTrendStatus('loading')
    fetch(`${API_BASE}/api/products/${selectedProduct.productId}/trend`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json()
      })
      .then((data) => {
        if (cancelled) return
        setTrend(data)
        setTrendStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setTrendStatus('unavailable')
      })
    return () => {
      cancelled = true
    }
  }, [selectedProduct, usingApi])

  const openProduct = (product) => setSelectedProduct(product)
  const closeProduct = () => setSelectedProduct(null)

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

  // A new search/filter/sort invalidates whatever page the user was on.
  useEffect(() => {
    setPage(1)
  }, [query, store, sort])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pageStart = (safePage - 1) * PAGE_SIZE
  const pageItems = filtered.slice(pageStart, pageStart + PAGE_SIZE)

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

  const localCompareGroups = useMemo(() => groupAcrossStores(products), [products])
  const crossStoreGroups = usingApi ? apiCompareGroups : localCompareGroups

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
          {status === 'ready'
            ? `${usingApi ? 'Live' : 'Static snapshot'} · data as of ${timeAgo(lastSync)} · checked ${lastChecked ? lastChecked.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}`
            : status === 'error'
              ? 'Data unavailable'
              : 'Loading data…'}
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
            <form className="search" role="search" onSubmit={(event) => event.preventDefault()}>
              <button type="submit" className="search-btn" aria-label="Search">⌕</button>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search products"
                aria-label="Search products"
              />
              {query && (
                <button
                  type="button"
                  className="search-clear"
                  aria-label="Clear search"
                  onClick={() => setQuery('')}
                >
                  ✕
                </button>
              )}
            </form>
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
                {pageItems.map((product) => (
                  <article
                    className="product clickable"
                    key={product.id}
                    onClick={() => openProduct(product)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => event.key === 'Enter' && openProduct(product)}
                  >
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
                    <a
                      className="buy-btn"
                      href={product.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => event.stopPropagation()}
                    >
                      Visit ↗
                    </a>
                    <button
                      type="button"
                      className={`watch-btn${watching.includes(product.id) ? ' watching' : ''}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        toggleWatch(product.id)
                      }}
                      aria-label={`Watch ${product.name}`}
                    >
                      {watching.includes(product.id) ? '◆' : '◇'}
                    </button>
                  </article>
                ))}
                {filtered.length === 0 && <p className="no-results">No products match your filters.</p>}
              </div>

              {pageCount > 1 && (
                <nav className="pagination" aria-label="Product pages">
                  <span className="page-range">
                    {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filtered.length)} of {filtered.length}
                  </span>
                  <div className="page-buttons">
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={safePage === 1}
                    >
                      ‹ Prev
                    </button>
                    {pageNumbers(safePage, pageCount).map((num, index, arr) => (
                      <span key={num} className="page-number-group">
                        {index > 0 && num - arr[index - 1] > 1 && <span className="page-ellipsis">…</span>}
                        <button
                          type="button"
                          className={num === safePage ? 'active' : ''}
                          onClick={() => setPage(num)}
                          aria-current={num === safePage ? 'page' : undefined}
                        >
                          {num}
                        </button>
                      </span>
                    ))}
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                      disabled={safePage === pageCount}
                    >
                      Next ›
                    </button>
                  </div>
                </nav>
              )}
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

      {selectedProduct && (
        <ProductDetail
          product={selectedProduct}
          history={history}
          historyStatus={historyStatus}
          trend={trend}
          trendStatus={trendStatus}
          onClose={closeProduct}
        />
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
