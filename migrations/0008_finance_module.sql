CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'Прочее',
  title TEXT NOT NULL,
  amount REAL NOT NULL CHECK(amount > 0),
  spent_on TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses(user_id,spent_on);

CREATE TABLE IF NOT EXISTS debts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  creditor TEXT NOT NULL DEFAULT '',
  initial_amount REAL NOT NULL CHECK(initial_amount > 0),
  balance REAL NOT NULL CHECK(balance >= 0),
  interest_rate REAL NOT NULL DEFAULT 0 CHECK(interest_rate >= 0),
  minimum_payment REAL NOT NULL DEFAULT 0 CHECK(minimum_payment >= 0),
  due_day INTEGER,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK(due_day IS NULL OR (due_day >= 1 AND due_day <= 31))
);
CREATE INDEX IF NOT EXISTS idx_debts_user_status ON debts(user_id,status);

CREATE TABLE IF NOT EXISTS debt_payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  debt_id TEXT NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
  amount REAL NOT NULL CHECK(amount > 0),
  paid_on TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_debt_payments_user_date ON debt_payments(user_id,paid_on);

CREATE TABLE IF NOT EXISTS payment_obligations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  amount REAL NOT NULL CHECK(amount > 0),
  due_date TEXT NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'once' CHECK(frequency IN ('once','monthly','weekly')),
  recurrence_day INTEGER CHECK(recurrence_day IS NULL OR (recurrence_day >= 1 AND recurrence_day <= 31)),
  category TEXT NOT NULL DEFAULT 'Обязательный платёж',
  notes TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_obligations_user_due ON payment_obligations(user_id,active,due_date);
