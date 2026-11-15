ALTER TABLE deals ADD COLUMN loss_reason_category TEXT;
ALTER TABLE deals ADD COLUMN loss_reason_details TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_deals_user_stage_loss ON deals(user_id,stage,loss_reason_category);
