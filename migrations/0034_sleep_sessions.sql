CREATE TABLE IF NOT EXISTS sleep_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sleep_date TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Europe/Moscow',
  went_to_bed_at TEXT,
  fell_asleep_at TEXT,
  woke_at TEXT,
  wake_date TEXT,
  bed_source TEXT,
  asleep_source TEXT,
  wake_source TEXT,
  bed_confidence TEXT,
  asleep_confidence TEXT,
  wake_confidence TEXT,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, sleep_date)
);
CREATE INDEX IF NOT EXISTS idx_sleep_sessions_user_wake_date
  ON sleep_sessions(user_id, wake_date);
