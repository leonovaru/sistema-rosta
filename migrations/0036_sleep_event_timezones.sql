ALTER TABLE sleep_sessions ADD COLUMN bed_timezone TEXT;
ALTER TABLE sleep_sessions ADD COLUMN asleep_timezone TEXT;
ALTER TABLE sleep_sessions ADD COLUMN wake_timezone TEXT;
UPDATE sleep_sessions SET bed_timezone = timezone WHERE went_to_bed_at IS NOT NULL AND bed_timezone IS NULL;
UPDATE sleep_sessions SET asleep_timezone = timezone WHERE fell_asleep_at IS NOT NULL AND asleep_timezone IS NULL;
UPDATE sleep_sessions SET wake_timezone = timezone WHERE woke_at IS NOT NULL AND wake_timezone IS NULL;
