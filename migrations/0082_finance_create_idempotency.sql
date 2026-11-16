-- Prevent duplicate income and ordinary expense records on request retries.
ALTER TABLE income_entries ADD COLUMN request_id TEXT;
ALTER TABLE expenses ADD COLUMN request_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_income_entries_request
 ON income_entries(user_id,request_id) WHERE request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_request
 ON expenses(user_id,request_id) WHERE request_id IS NOT NULL;
