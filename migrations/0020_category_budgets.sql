CREATE TABLE IF NOT EXISTS category_budgets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  category TEXT NOT NULL,
  planned_amount REAL NOT NULL CHECK(planned_amount >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, month, category)
);
CREATE INDEX IF NOT EXISTS idx_category_budgets_user_month ON category_budgets(user_id, month);
