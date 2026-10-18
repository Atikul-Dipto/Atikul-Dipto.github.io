-- The citizens of the Silo: names visitors add in the citizens' room.
CREATE TABLE IF NOT EXISTS citizens (
  n INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  -- Taken down by the owner: kept, but never shown.
  hidden INTEGER NOT NULL DEFAULT 0
);
-- The whole visible list as one JSON row, so a visit reads one row, not ten thousand.
CREATE TABLE IF NOT EXISTS snapshot (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- Recent joins by a salted, daily hash of the connection address: spam limits only.
CREATE TABLE IF NOT EXISTS joins (
  ip_hash TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS joins_by_ip ON joins (ip_hash, at);
INSERT OR IGNORE INTO snapshot (key, value) VALUES ('list', '[]');
