ALTER TABLE projects ADD COLUMN cost_budget REAL NOT NULL DEFAULT 0 CHECK(cost_budget>=0);
