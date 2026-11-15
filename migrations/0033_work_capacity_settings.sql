ALTER TABLE settings ADD COLUMN work_capacity_configured INTEGER NOT NULL DEFAULT 0;
ALTER TABLE settings ADD COLUMN working_days_json TEXT NOT NULL DEFAULT '[]';
