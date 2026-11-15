ALTER TABLE settings ADD COLUMN starting_balance REAL NOT NULL DEFAULT 0 CHECK(starting_balance>=0);
CREATE TABLE IF NOT EXISTS planned_cashflows (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 direction_id TEXT REFERENCES directions(id) ON DELETE SET NULL,
 flow_type TEXT NOT NULL CHECK(flow_type IN ('income','expense')),
 title TEXT NOT NULL,
 amount REAL NOT NULL CHECK(amount>0),
 expected_date TEXT NOT NULL,
 note TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','realized','cancelled')),
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_planned_cashflows_user_date ON planned_cashflows(user_id,status,expected_date);
