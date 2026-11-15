CREATE TABLE IF NOT EXISTS obligation_payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  obligation_id TEXT NOT NULL REFERENCES payment_obligations(id) ON DELETE CASCADE,
  amount REAL NOT NULL CHECK(amount > 0),
  paid_on TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_obligation_payments_user_date ON obligation_payments(user_id,paid_on);
