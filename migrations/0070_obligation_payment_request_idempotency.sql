-- Safe retry key for obligation payment actions.
ALTER TABLE obligation_payments ADD COLUMN request_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_obligation_payments_request ON obligation_payments(user_id,request_id) WHERE request_id IS NOT NULL;
