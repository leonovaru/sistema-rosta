-- Link explicit meeting agreements to created tasks.
CREATE TABLE IF NOT EXISTS meeting_task_links (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  meeting_id TEXT NOT NULL REFERENCES meeting_notes(id) ON DELETE CASCADE,
  agreement_index INTEGER NOT NULL CHECK(agreement_index >= 0),
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(meeting_id,agreement_index)
);
CREATE INDEX IF NOT EXISTS idx_meeting_task_links_task ON meeting_task_links(user_id,task_id);
