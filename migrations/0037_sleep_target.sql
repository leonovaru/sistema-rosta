ALTER TABLE settings ADD COLUMN sleep_target_minutes INTEGER CHECK (sleep_target_minutes IS NULL OR sleep_target_minutes BETWEEN 180 AND 720);
