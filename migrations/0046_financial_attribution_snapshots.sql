-- Preserve financial attribution as it was when each transaction was recorded.
ALTER TABLE income_entries ADD COLUMN direction_id_snapshot TEXT;
ALTER TABLE income_entries ADD COLUMN direction_title_snapshot TEXT;
ALTER TABLE income_entries ADD COLUMN client_id_snapshot TEXT;
ALTER TABLE income_entries ADD COLUMN client_name_snapshot TEXT;
ALTER TABLE income_entries ADD COLUMN project_id_snapshot TEXT;
ALTER TABLE income_entries ADD COLUMN project_title_snapshot TEXT;

ALTER TABLE expenses ADD COLUMN direction_id_snapshot TEXT;
ALTER TABLE expenses ADD COLUMN direction_title_snapshot TEXT;
ALTER TABLE expenses ADD COLUMN client_id_snapshot TEXT;
ALTER TABLE expenses ADD COLUMN client_name_snapshot TEXT;
ALTER TABLE expenses ADD COLUMN project_id_snapshot TEXT;
ALTER TABLE expenses ADD COLUMN project_title_snapshot TEXT;

UPDATE income_entries
SET direction_id_snapshot=direction_id,
    direction_title_snapshot=(SELECT title FROM directions WHERE id=income_entries.direction_id AND user_id=income_entries.user_id),
    client_id_snapshot=client_id,
    client_name_snapshot=(SELECT name FROM clients WHERE id=income_entries.client_id AND user_id=income_entries.user_id),
    project_id_snapshot=project_id,
    project_title_snapshot=(SELECT title FROM projects WHERE id=income_entries.project_id AND user_id=income_entries.user_id);

UPDATE expenses
SET direction_id_snapshot=direction_id,
    direction_title_snapshot=(SELECT title FROM directions WHERE id=expenses.direction_id AND user_id=expenses.user_id),
    client_id_snapshot=client_id,
    client_name_snapshot=(SELECT name FROM clients WHERE id=expenses.client_id AND user_id=expenses.user_id),
    project_id_snapshot=project_id,
    project_title_snapshot=(SELECT title FROM projects WHERE id=expenses.project_id AND user_id=expenses.user_id);

CREATE INDEX IF NOT EXISTS idx_income_user_direction_snapshot_date ON income_entries(user_id,direction_id_snapshot,received_on);
CREATE INDEX IF NOT EXISTS idx_expenses_user_direction_snapshot_date ON expenses(user_id,direction_id_snapshot,spent_on);
