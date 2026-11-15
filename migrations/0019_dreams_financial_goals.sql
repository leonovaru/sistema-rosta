CREATE TABLE IF NOT EXISTS dreams (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',reason TEXT NOT NULL DEFAULT '',
 image_url TEXT NOT NULL DEFAULT '',reference_url TEXT NOT NULL DEFAULT '',
 estimated_cost REAL CHECK(estimated_cost IS NULL OR estimated_cost>=0),
 desired_date TEXT,category TEXT NOT NULL DEFAULT 'other',
 priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high')),
 status TEXT NOT NULL DEFAULT 'dream' CHECK(status IN ('dream','considering','converted','paused','completed')),
 created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_dreams_user_status ON dreams(user_id,status,priority,created_at);
CREATE TABLE IF NOT EXISTS financial_goals (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 dream_id TEXT REFERENCES dreams(id) ON DELETE SET NULL,
 title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',
 target_amount REAL NOT NULL CHECK(target_amount>0),
 saved_amount REAL NOT NULL DEFAULT 0 CHECK(saved_amount>=0),
 monthly_contribution REAL NOT NULL DEFAULT 0 CHECK(monthly_contribution>=0),
 target_date TEXT,priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high')),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','completed','archived')),
 created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_financial_goals_user_status ON financial_goals(user_id,status,target_date);
CREATE INDEX IF NOT EXISTS idx_financial_goals_dream ON financial_goals(user_id,dream_id);
