-- Clients, projects and personal life areas. Existing tasks remain valid.
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  direction_id TEXT REFERENCES directions(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  contact TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('lead','active','paused','closed')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_clients_user_direction ON clients(user_id,direction_id,status);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
  direction_id TEXT REFERENCES directions(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  expected_result TEXT NOT NULL DEFAULT '',
  deadline TEXT,
  budget REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('draft','active','waiting','done','archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_projects_user_status ON projects(user_id,status,deadline);
CREATE INDEX IF NOT EXISTS idx_projects_client ON projects(user_id,client_id);

CREATE TABLE IF NOT EXISTS life_areas (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id,title)
);
CREATE INDEX IF NOT EXISTS idx_life_areas_user ON life_areas(user_id,active,sort_order);

ALTER TABLE tasks ADD COLUMN client_id TEXT REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN life_area_id TEXT REFERENCES life_areas(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN parent_task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(user_id,project_id,status,due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_life_area ON tasks(user_id,life_area_id,status,due_date);
