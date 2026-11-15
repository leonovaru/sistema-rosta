CREATE TABLE IF NOT EXISTS irregular_expenses (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 title TEXT NOT NULL,
 category TEXT NOT NULL DEFAULT 'Нерегулярные расходы',
 amount REAL NOT NULL CHECK(amount > 0),
 next_date TEXT NOT NULL,
 frequency TEXT NOT NULL DEFAULT 'once' CHECK(frequency IN ('once','yearly','quarterly')),
 notes TEXT NOT NULL DEFAULT '',
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 created_at TEXT NOT NULL DEFAULT (datetime('now')),
 updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_irregular_expenses_user_date ON irregular_expenses(user_id,active,next_date);
