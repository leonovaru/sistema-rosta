ALTER TABLE planned_cashflows ADD COLUMN client_id TEXT REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE planned_cashflows ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_planned_cashflows_project_date ON planned_cashflows(user_id,project_id,status,expected_date);
