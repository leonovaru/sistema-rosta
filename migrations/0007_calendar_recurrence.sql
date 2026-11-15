ALTER TABLE calendar_events ADD COLUMN repeat_rule TEXT NOT NULL DEFAULT 'none' CHECK(repeat_rule IN ('none','daily','weekly'));
ALTER TABLE calendar_events ADD COLUMN repeat_until TEXT;
CREATE INDEX IF NOT EXISTS idx_calendar_events_repeat ON calendar_events(user_id,repeat_rule,repeat_until);
