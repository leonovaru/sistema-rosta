-- Client interaction history: calls, messages, emails and working notes.
CREATE TABLE IF NOT EXISTS client_interactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  interaction_type TEXT NOT NULL CHECK(interaction_type IN ('call','email','message','note')),
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  occurred_on TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_client_interactions_timeline
  ON client_interactions(user_id,client_id,occurred_on DESC,created_at DESC);
