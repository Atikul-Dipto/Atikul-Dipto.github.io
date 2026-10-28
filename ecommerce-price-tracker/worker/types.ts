/**
 * Shared shapes for the Price Pulse agent as it runs on Cloudflare
 * (functions/api/pp/* at the site root). A port of the Python agent in
 * ../agent/ — same steps, same rules; the Python copy stays the local
 * development and voucher-harvesting side. Prices are BDT numbers.
 */

export interface Intent {
  rawQuery: string
  mode: 'product' | 'need' // named a specific item | described what they want
  searchQuery: string
  productType: string | null
  brand: string | null
  minPrice: number | null
  maxPrice: number | null
  mustHave: string[]
  refinedQuery?: string | null // kind-of-item searches: the kind plus descriptive words the shopper typed ("formal Shirt")
  source: 'llm' | 'rules' | 'typed' // who read it: the AI, the rule fallback, or nobody (a product name taken as typed)
}

export interface Listing {
  site: 'daraz' | 'cartup'
  itemId: string
  name: string
  url: string
  image: string
  price: number
  originalPrice: number | null
  discountPercent: number | null
  seller: string
  brand: string
  rating: number | null
  reviews: number
  sold: string
  inStock: boolean
  location: string
  officialStore: boolean // Daraz Mall ("lazMall" badge)
  badges: string[] // raw Daraz icon bizTypes, e.g. FreeshippingAndVoucherMax
  highlights: string[] // key-feature bullets Daraz returns with each search hit
  // Filled in by ranking
  relevance: number
  matchedFeatures: string[]
}

export interface Voucher {
  site: string
  title: string
  labels: string[]
  amount: number | null // flat BDT off
  percent: number | null
  maxDiscount: number | null
  minSpend: number | null
  validFrom: string | null // YYYY-MM-DD
  validTo: string | null
  sourceUrl: string
}

export interface VoucherCheck {
  voucher: Voucher
  status: 'applies' | 'conditional' | 'not_applicable'
  saving: number
  reasons: string[]
  conditions: string[]
}

export interface HistoryMatch {
  lastPrice: number
  lastSeen: string
  lowestPrice: number
  highestPrice: number
  checks: number
  firstSeen: string
}

export interface Env {
  AI?: { run(model: string, input: unknown): Promise<{ response?: unknown }> }
  PP_DB?: D1Database
}

// Minimal D1 surface used here (Cloudflare's types aren't installed in this repo).
export interface D1Database {
  prepare(sql: string): D1Statement
  batch(statements: D1Statement[]): Promise<unknown[]>
}
export interface D1Statement {
  bind(...values: unknown[]): D1Statement
  first<T>(): Promise<T | null>
  all<T>(): Promise<{ results: T[] }>
  run(): Promise<unknown>
}
