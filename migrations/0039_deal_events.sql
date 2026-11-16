CREATE TABLE IF NOT EXISTS deal_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK(event_type IN ('created','updated')),
  changes_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_deal_events_user_deal_date ON deal_events(user_id,deal_id,created_at DESC);
