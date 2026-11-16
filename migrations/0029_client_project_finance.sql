-- Attribute real income and expenses to the client and project that generated them.
ALTER TABLE income_entries ADD COLUMN client_id TEXT REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE income_entries ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE expenses ADD COLUMN client_id TEXT REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE expenses ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_income_user_client_date ON income_entries(user_id,client_id,received_on);
CREATE INDEX IF NOT EXISTS idx_income_user_project_date ON income_entries(user_id,project_id,received_on);
CREATE INDEX IF NOT EXISTS idx_expenses_user_client_date ON expenses(user_id,client_id,spent_on);
CREATE INDEX IF NOT EXISTS idx_expenses_user_project_date ON expenses(user_id,project_id,spent_on);
