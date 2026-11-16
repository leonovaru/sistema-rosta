CREATE TRIGGER IF NOT EXISTS trg_funding_transfer_goal_cap
BEFORE INSERT ON bucket_funding_transfers
WHEN NEW.target_type='goal' AND EXISTS(
 SELECT 1 FROM financial_goals g WHERE g.id=NEW.target_id AND g.user_id=NEW.user_id
 AND g.saved_amount+COALESCE((SELECT SUM(t.amount-COALESCE((SELECT SUM(r.amount) FROM bucket_funding_transfer_reversals r WHERE r.transfer_id=t.id),0)) FROM bucket_funding_transfers t WHERE t.user_id=NEW.user_id AND t.target_type='goal' AND t.target_id=g.id),0)+NEW.amount>g.target_amount+0.0001
)
BEGIN SELECT RAISE(ABORT,'Перевод превысит целевую сумму цели'); END;
