CREATE TABLE IF NOT EXISTS planned_cashflow_realizations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  planned_cashflow_id TEXT NOT NULL REFERENCES planned_cashflows(id) ON DELETE CASCADE,
  income_entry_id TEXT REFERENCES income_entries(id) ON DELETE CASCADE,
  expense_id TEXT REFERENCES expenses(id) ON DELETE CASCADE,
  amount REAL NOT NULL CHECK(amount > 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ((income_entry_id IS NOT NULL AND expense_id IS NULL) OR (income_entry_id IS NULL AND expense_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cashflow_realizations_income
  ON planned_cashflow_realizations(income_entry_id) WHERE income_entry_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_cashflow_realizations_expense
  ON planned_cashflow_realizations(expense_id) WHERE expense_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cashflow_realizations_plan
  ON planned_cashflow_realizations(user_id,planned_cashflow_id);
