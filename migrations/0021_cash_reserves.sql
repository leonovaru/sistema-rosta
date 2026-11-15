CREATE TABLE IF NOT EXISTS cash_reserves (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 title TEXT NOT NULL,
 purpose TEXT NOT NULL DEFAULT '',
 target_amount REAL NOT NULL CHECK(target_amount > 0),
 current_amount REAL NOT NULL DEFAULT 0 CHECK(current_amount >= 0),
 monthly_contribution REAL NOT NULL DEFAULT 0 CHECK(monthly_contribution >= 0),
 target_date TEXT,
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 created_at TEXT NOT NULL DEFAULT (datetime('now')),
 updated_at TEXT NOT NULL DEFAULT (datetime('now')),
 CHECK(current_amount <= target_amount)
);
CREATE INDEX IF NOT EXISTS idx_cash_reserves_user_active ON cash_reserves(user_id,active);
