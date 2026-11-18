-- The GTA VI watch party lobby (/gta6-watch-party/): PC players who claim a
-- spectator seat. Separate from the Silo's citizens; shares only the snapshot table.
CREATE TABLE IF NOT EXISTS squad (
  n INTEGER PRIMARY KEY AUTOINCREMENT,
  handle TEXT NOT NULL,
  rig TEXT NOT NULL,
  cope INTEGER NOT NULL,
  line TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  -- Taken down by the owner: kept, but never shown.
  hidden INTEGER NOT NULL DEFAULT 0
);
-- Recent seat claims by a salted, daily hash of the connection address: spam limits only.
CREATE TABLE IF NOT EXISTS squad_joins (
  ip_hash TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS squad_joins_by_ip ON squad_joins (ip_hash, at);
INSERT OR IGNORE INTO snapshot (key, value) VALUES ('squad', '{"count":0,"copeSum":0,"rigs":{},"recent":[]}');
