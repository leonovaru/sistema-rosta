-- Give manual reserve contributions and withdrawals durable idempotency keys.
ALTER TABLE cash_reserve_transactions ADD COLUMN request_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_reserve_transactions_request
 ON cash_reserve_transactions(user_id,request_id) WHERE request_id IS NOT NULL;
