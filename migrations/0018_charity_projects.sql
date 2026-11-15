CREATE TABLE IF NOT EXISTS charity_projects (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 title TEXT NOT NULL,
 organization TEXT NOT NULL DEFAULT '',
 purpose TEXT NOT NULL DEFAULT '',
 target_amount REAL NOT NULL DEFAULT 0 CHECK(target_amount>=0),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','completed','archived')),
 start_date TEXT,
 end_date TEXT,
 notes TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT (datetime('now')),
 updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_charity_projects_user_status ON charity_projects(user_id,status,created_at);

CREATE TABLE IF NOT EXISTS charity_transactions (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL REFERENCES charity_projects(id) ON DELETE CASCADE,
 person_id TEXT,
 type TEXT NOT NULL CHECK(type IN ('donation','expense')),
 category TEXT NOT NULL DEFAULT '',
 title TEXT NOT NULL,
 amount REAL NOT NULL CHECK(amount>0),
 occurred_on TEXT NOT NULL,
 note TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_charity_transactions_project_date ON charity_transactions(user_id,project_id,occurred_on);

CREATE TABLE IF NOT EXISTS charity_people (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 project_id TEXT REFERENCES charity_projects(id) ON DELETE SET NULL,
 name TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('partner','volunteer','supporter')),
 contact TEXT NOT NULL DEFAULT '',
 notes TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_charity_people_user_project ON charity_people(user_id,project_id,role);
