CREATE TABLE IF NOT EXISTS daily_task_allocations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  allocation_date TEXT NOT NULL,
  minutes INTEGER NOT NULL CHECK(minutes > 0 AND minutes <= 10000),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id,task_id,allocation_date)
);
CREATE INDEX IF NOT EXISTS idx_daily_task_allocations_user_date
  ON daily_task_allocations(user_id,allocation_date);
CREATE INDEX IF NOT EXISTS idx_daily_task_allocations_task
  ON daily_task_allocations(user_id,task_id);