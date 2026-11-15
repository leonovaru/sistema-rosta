-- Recurring task templates can generate a parent task with a stable set of child tasks.
CREATE TABLE IF NOT EXISTS task_template_steps (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES task_templates(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_task_template_steps_template ON task_template_steps(user_id,template_id,sort_order);
ALTER TABLE tasks ADD COLUMN template_step_id TEXT REFERENCES task_template_steps(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_template_step_date ON tasks(template_step_id,due_date) WHERE template_step_id IS NOT NULL;
