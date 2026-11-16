-- Reserve balance changes must be explicit contribution/withdrawal operations.
DROP TRIGGER IF EXISTS trg_cash_reserve_balance_audit;

CREATE TRIGGER IF NOT EXISTS trg_cash_reserve_transaction_owner_insert
BEFORE INSERT ON cash_reserve_transactions
WHEN NOT EXISTS (
 SELECT 1 FROM cash_reserves r
 WHERE r.id=NEW.reserve_id AND r.user_id=NEW.user_id
)
BEGIN
 SELECT RAISE(ABORT,'Операция должна относиться к резерву этого пользователя');
END;
