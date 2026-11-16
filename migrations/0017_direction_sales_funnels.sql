CREATE TABLE IF NOT EXISTS direction_sales_funnels (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 direction_id TEXT NOT NULL REFERENCES directions(id) ON DELETE CASCADE,
 contact_to_lead_percent REAL NOT NULL DEFAULT 40 CHECK(contact_to_lead_percent>=0 AND contact_to_lead_percent<=100),
 lead_to_sale_percent REAL NOT NULL DEFAULT 20 CHECK(lead_to_sale_percent>=0 AND lead_to_sale_percent<=100),
 updated_at TEXT NOT NULL DEFAULT (datetime('now')),
 PRIMARY KEY(user_id,direction_id)
);
CREATE INDEX IF NOT EXISTS idx_direction_sales_funnels_user ON direction_sales_funnels(user_id);