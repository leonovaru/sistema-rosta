CREATE TRIGGER IF NOT EXISTS trg_funding_reversal_reserve_balance
BEFORE INSERT ON bucket_funding_transfer_reversals
WHEN EXISTS(
 SELECT 1 FROM bucket_funding_transfers t JOIN cash_reserves r ON r.id=t.target_id AND r.user_id=t.user_id
 WHERE t.id=NEW.transfer_id AND t.user_id=NEW.user_id AND t.target_type='reserve' AND r.current_amount+0.0001<NEW.amount
)
BEGIN SELECT RAISE(ABORT,'В резерве уже использована часть перевода. Полная отмена невозможна до восстановления остатка'); END;
