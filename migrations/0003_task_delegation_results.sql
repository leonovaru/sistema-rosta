ALTER TABLE tasks ADD COLUMN delegated_result TEXT NOT NULL DEFAULT '';
ALTER TABLE tasks ADD COLUMN delegated_at TEXT;
