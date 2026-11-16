CREATE TABLE IF NOT EXISTS income_buckets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  percentage REAL NOT NULL DEFAULT 0 CHECK(percentage >= 0 AND percentage <= 100),
  bucket_type TEXT NOT NULL DEFAULT 'spending' CHECK(bucket_type IN ('spending','capital')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id,title)
);
CREATE INDEX IF NOT EXISTS idx_income_buckets_user ON income_buckets(user_id,sort_order);

CREATE TABLE IF NOT EXISTS income_bucket_allocations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  income_id TEXT NOT NULL REFERENCES income_entries(id) ON DELETE CASCADE,
  bucket_id TEXT NOT NULL REFERENCES income_buckets(id) ON DELETE CASCADE,
  percentage REAL NOT NULL CHECK(percentage >= 0 AND percentage <= 100),
  amount REAL NOT NULL CHECK(amount >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(income_id,bucket_id)
);
CREATE INDEX IF NOT EXISTS idx_bucket_allocations_user ON income_bucket_allocations(user_id,bucket_id);

ALTER TABLE expenses ADD COLUMN bucket_id TEXT REFERENCES income_buckets(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_bucket ON expenses(user_id,bucket_id,spent_on);

INSERT INTO income_buckets (id,user_id,title,percentage,bucket_type,sort_order)
SELECT lower(hex(randomblob(16))),u.id,b.title,b.percentage,b.bucket_type,b.sort_order
FROM users u CROSS JOIN (
  SELECT 'Жильё' title,30 percentage,'spending' bucket_type,1 sort_order UNION ALL
  SELECT 'Питание',20,'spending',2 UNION ALL
  SELECT 'Долги и обязательства',20,'spending',3 UNION ALL
  SELECT 'Капитал',10,'capital',4 UNION ALL
  SELECT 'Коты',5,'spending',5 UNION ALL
  SELECT 'Транспорт',5,'spending',6 UNION ALL
  SELECT 'Здоровье и уход',5,'spending',7 UNION ALL
  SELECT 'Свободные расходы',5,'spending',8
) b;
