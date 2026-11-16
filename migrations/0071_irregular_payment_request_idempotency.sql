-- Safe retry key for irregular expense payment actions.
ALTER TABLE irregular_expense_payments ADD COLUMN request_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_irregular_expense_payments_request ON irregular_expense_payments(user_id,request_id) WHERE request_id IS NOT NULL;
