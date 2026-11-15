CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('meeting','travel','hobby','sleep','work','personal','other')),
  mode TEXT NOT NULL DEFAULT 'none' CHECK(mode IN ('none','online','offline')),
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  actual_start_at TEXT,
  actual_end_at TEXT,
  location TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','completed','cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK(end_at > start_at),
  CHECK(actual_end_at IS NULL OR actual_start_at IS NULL OR actual_end_at > actual_start_at)
);
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_start ON calendar_events(user_id,start_at,end_at);