-- Price Pulse agent memory (D1 database "price-pulse", binding PP_DB).
-- Timestamps are ISO-8601 UTC strings ("2026-10-21T17:30:00.000Z") so they
-- compare correctly as text.

-- One row per Daraz item, keyed by Daraz's item id (the "-i123456" in its URL).
CREATE TABLE listings (
  item_id    TEXT PRIMARY KEY,
  site       TEXT NOT NULL,
  name       TEXT NOT NULL,
  url        TEXT NOT NULL,
  first_seen TEXT NOT NULL,
  last_seen  TEXT NOT NULL
);

-- source: 'scrape' (seeded from the hourly scraper's Postgres history) or 'agent' (a lookup).
CREATE TABLE price_history (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id        TEXT NOT NULL,
  price          REAL NOT NULL,
  original_price REAL,
  seen_at        TEXT NOT NULL,
  source         TEXT NOT NULL
);
CREATE INDEX price_history_item ON price_history (item_id, seen_at);

-- Public vouchers harvested from Daraz campaign pages on the developer's PC.
CREATE TABLE vouchers (
  fingerprint  TEXT PRIMARY KEY,
  site         TEXT NOT NULL,
  title        TEXT NOT NULL,
  labels       TEXT NOT NULL DEFAULT '[]',
  amount       REAL,
  percent      REAL,
  max_discount REAL,
  min_spend    REAL,
  valid_from   TEXT,
  valid_to     TEXT,
  source_url   TEXT NOT NULL,
  raw_text     TEXT NOT NULL,
  first_seen   TEXT NOT NULL,
  last_seen    TEXT NOT NULL
);

-- Each question asked and how it went. Nothing about the visitor is stored.
CREATE TABLE asks (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  asked_at        TEXT NOT NULL,
  query           TEXT NOT NULL,
  mode            TEXT,
  intent_source   TEXT,
  results         INTEGER NOT NULL DEFAULT 0,
  best_price      REAL,
  best_final      REAL,
  voucher_applied INTEGER NOT NULL DEFAULT 0,
  total_ms        INTEGER,
  timings         TEXT,
  error           TEXT
);
