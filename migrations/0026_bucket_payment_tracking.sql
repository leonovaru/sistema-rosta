ALTER TABLE debt_payments ADD COLUMN bucket_id TEXT REFERENCES income_buckets(id) ON DELETE SET NULL;
ALTER TABLE obligation_payments ADD COLUMN bucket_id TEXT REFERENCES income_buckets(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_debt_payments_bucket ON debt_payments(user_id,bucket_id,paid_on);
CREATE INDEX IF NOT EXISTS idx_obligation_payments_bucket ON obligation_payments(user_id,bucket_id,paid_on);
