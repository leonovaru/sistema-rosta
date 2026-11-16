ALTER TABLE task_time_entries ADD COLUMN attribution_captured INTEGER NOT NULL DEFAULT 0;
ALTER TABLE task_time_entries ADD COLUMN direction_id TEXT;
ALTER TABLE task_time_entries ADD COLUMN project_id TEXT;
ALTER TABLE task_time_entries ADD COLUMN life_area_id TEXT;
ALTER TABLE task_time_entries ADD COLUMN client_id TEXT;
ALTER TABLE task_time_entries ADD COLUMN direction_title TEXT;
ALTER TABLE task_time_entries ADD COLUMN project_title TEXT;
ALTER TABLE task_time_entries ADD COLUMN life_area_title TEXT;
ALTER TABLE task_time_entries ADD COLUMN client_name TEXT;
