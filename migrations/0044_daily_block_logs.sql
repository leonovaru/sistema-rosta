CREATE TABLE IF NOT EXISTS daily_block_logs (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL,
 task_id TEXT NOT NULL,
 block_date TEXT NOT NULL,
 start_time TEXT NOT NULL,
 end_time TEXT NOT NULL,
 planned_minutes INTEGER NOT NULL CHECK(planned_minutes > 0),
 actual_minutes INTEGER NOT NULL DEFAULT 0 CHECK(actual_minutes >= 0),
 status TEXT NOT NULL CHECK(status IN ('done','skipped','interrupted')),
 note TEXT,
 created_at TEXT NOT NULL DEFAULT (datetime('now')),
 updated_at TEXT NOT NULL DEFAULT (datetime('now')),
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE,
 UNIQUE(user_id,task_id,block_date,start_time,end_time)
);
CREATE INDEX IF NOT EXISTS idx_daily_block_logs_user_date ON daily_block_logs(user_id,block_date);
CREATE INDEX IF NOT EXISTS idx_daily_block_logs_user_task ON daily_block_logs(user_id,task_id,block_date);
