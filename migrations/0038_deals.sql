CREATE TABLE IF NOT EXISTS deals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
  direction_id TEXT REFERENCES directions(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  amount REAL NOT NULL CHECK(amount > 0 AND amount <= 100000000),
  stage TEXT NOT NULL CHECK(stage IN ('contact','negotiation','proposal','awaiting_payment','won','lost')),
  probability_percent INTEGER NOT NULL DEFAULT 20 CHECK(probability_percent BETWEEN 0 AND 100),
  expected_close_date TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_deals_user_stage_date ON deals(user_id,stage,expected_close_date);
CREATE INDEX IF NOT EXISTS idx_deals_user_direction ON deals(user_id,direction_id);
