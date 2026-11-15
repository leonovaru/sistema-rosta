CREATE TABLE IF NOT EXISTS irregular_expense_payments (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 irregular_expense_id TEXT NOT NULL REFERENCES irregular_expenses(id) ON DELETE CASCADE,
 amount REAL NOT NULL CHECK(amount > 0),
 paid_on TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_irregular_expense_payments_user_date ON irregular_expense_payments(user_id,paid_on);
CREATE INDEX IF NOT EXISTS idx_irregular_expense_payments_item ON irregular_expense_payments(irregular_expense_id,paid_on);
