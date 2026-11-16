ALTER TABLE deals ADD COLUMN expected_payment_date TEXT;
UPDATE deals SET expected_payment_date=expected_close_date,expected_close_date=NULL WHERE expected_close_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deals_user_payment_date ON deals(user_id,stage,expected_payment_date);
