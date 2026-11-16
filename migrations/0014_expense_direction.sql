ALTER TABLE expenses ADD COLUMN direction_id TEXT REFERENCES directions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_user_direction_date ON expenses(user_id,direction_id,spent_on);
