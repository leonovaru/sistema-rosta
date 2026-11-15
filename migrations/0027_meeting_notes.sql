-- Structured meeting notes and confirmed outcomes from voice capture.
CREATE TABLE IF NOT EXISTS meeting_notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  meeting_date TEXT NOT NULL,
  participants TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  decisions_json TEXT NOT NULL DEFAULT '[]',
  agreements_json TEXT NOT NULL DEFAULT '[]',
  open_questions_json TEXT NOT NULL DEFAULT '[]',
  transcript TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_meeting_notes_user_date ON meeting_notes(user_id,meeting_date DESC);
CREATE INDEX IF NOT EXISTS idx_meeting_notes_project ON meeting_notes(user_id,project_id,meeting_date DESC);
