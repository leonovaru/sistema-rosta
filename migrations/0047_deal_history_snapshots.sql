ALTER TABLE deals ADD COLUMN archived_at TEXT;
ALTER TABLE deal_events ADD COLUMN direction_id_snapshot TEXT;
ALTER TABLE deal_events ADD COLUMN client_id_snapshot TEXT;

UPDATE deal_events
SET direction_id_snapshot=(SELECT direction_id FROM deals WHERE deals.id=deal_events.deal_id AND deals.user_id=deal_events.user_id),
    client_id_snapshot=(SELECT client_id FROM deals WHERE deals.id=deal_events.deal_id AND deals.user_id=deal_events.user_id);

CREATE INDEX IF NOT EXISTS idx_deals_user_active_stage ON deals(user_id,archived_at,stage);
CREATE INDEX IF NOT EXISTS idx_deal_events_user_direction_date ON deal_events(user_id,direction_id_snapshot,created_at);
