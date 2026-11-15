-- Recurring task templates create independent dated task instances.
CREATE TABLE IF NOT EXISTS task_templates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  life_area_id TEXT REFERENCES life_areas(id) ON DELETE SET NULL,
  direction_id TEXT REFERENCES directions(id) ON DELETE SET NULL,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high')),
  estimated_minutes INTEGER,
  recurrence TEXT NOT NULL CHECK(recurrence IN ('daily','weekly','monthly')),
  start_date TEXT NOT NULL,
  end_date TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_task_templates_user_active ON task_templates(user_id,active,start_date);
ALTER TABLE tasks ADD COLUMN template_id TEXT REFERENCES task_templates(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_template_date ON tasks(template_id,due_date) WHERE template_id IS NOT NULL;
