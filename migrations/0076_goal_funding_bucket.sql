-- Optional planned funding source for financial goals; no money is moved automatically.
ALTER TABLE financial_goals ADD COLUMN funding_bucket_id TEXT REFERENCES income_buckets(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_financial_goals_funding_bucket ON financial_goals(user_id,funding_bucket_id);
