CREATE TABLE IF NOT EXISTS direction_revenue_targets (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  direction_id TEXT NOT NULL REFERENCES directions(id) ON DELETE CASCADE,
  share_percent REAL NOT NULL DEFAULT 0 CHECK(share_percent>=0 AND share_percent<=100),
  average_sale_amount REAL NOT NULL DEFAULT 0 CHECK(average_sale_amount>=0),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(user_id,direction_id)
);
CREATE INDEX IF NOT EXISTS idx_direction_revenue_targets_user ON direction_revenue_targets(user_id);