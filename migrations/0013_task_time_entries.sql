CREATE TABLE IF NOT EXISTS task_time_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  duration_minutes INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_task_time_entries_task ON task_time_entries(user_id,task_id,started_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_task_time_entries_one_active_per_user ON task_time_entries(user_id) WHERE ended_at IS NULL;
