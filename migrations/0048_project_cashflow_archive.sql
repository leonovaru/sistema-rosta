ALTER TABLE planned_cashflows ADD COLUMN archived_at TEXT;
CREATE INDEX IF NOT EXISTS idx_planned_cashflows_visible_project
  ON planned_cashflows(user_id,project_id,archived_at,expected_date);
