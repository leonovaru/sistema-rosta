CREATE TABLE IF NOT EXISTS weekly_time_targets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  direction_id TEXT REFERENCES directions(id) ON DELETE CASCADE,
  life_area_id TEXT REFERENCES life_areas(id) ON DELETE CASCADE,
  target_minutes INTEGER NOT NULL CHECK(target_minutes >= 0 AND target_minutes <= 10080),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK((direction_id IS NOT NULL AND life_area_id IS NULL) OR (direction_id IS NULL AND life_area_id IS NOT NULL)),
  UNIQUE(user_id,direction_id),
  UNIQUE(user_id,life_area_id)
);
CREATE INDEX IF NOT EXISTS idx_weekly_time_targets_user ON weekly_time_targets(user_id);