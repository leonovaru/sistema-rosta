-- Idempotency key for safe retries of debt-payment requests.
ALTER TABLE debt_payments ADD COLUMN request_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_debt_payments_request ON debt_payments(user_id,request_id) WHERE request_id IS NOT NULL;
