-- Keep a durable audit trail for reserve balance changes.
CREATE TABLE IF NOT EXISTS cash_reserve_transactions (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 reserve_id TEXT NOT NULL REFERENCES cash_reserves(id) ON DELETE RESTRICT,
 transaction_type TEXT NOT NULL CHECK(transaction_type IN ('opening','contribution','withdrawal','adjustment')),
 amount REAL NOT NULL CHECK(amount > 0),
 balance_after REAL NOT NULL CHECK(balance_after >= 0),
 note TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cash_reserve_transactions_reserve ON cash_reserve_transactions(user_id,reserve_id,created_at);

INSERT INTO cash_reserve_transactions(id,user_id,reserve_id,transaction_type,amount,balance_after,note,created_at)
SELECT 'opening-'||id,user_id,id,'opening',current_amount,current_amount,'Начальный остаток на момент включения журнала',created_at
FROM cash_reserves WHERE current_amount>0;

CREATE TRIGGER IF NOT EXISTS trg_cash_reserve_opening_balance
AFTER INSERT ON cash_reserves
WHEN NEW.current_amount>0
BEGIN
 INSERT INTO cash_reserve_transactions(id,user_id,reserve_id,transaction_type,amount,balance_after,note)
 VALUES('opening-'||NEW.id,NEW.user_id,NEW.id,'opening',NEW.current_amount,NEW.current_amount,'Начальный остаток');
END;

CREATE TRIGGER IF NOT EXISTS trg_cash_reserve_balance_audit
AFTER UPDATE OF current_amount ON cash_reserves
WHEN ABS(NEW.current_amount-OLD.current_amount)>0.000001
BEGIN
 INSERT INTO cash_reserve_transactions(id,user_id,reserve_id,transaction_type,amount,balance_after,note)
 VALUES(lower(hex(randomblob(16))),NEW.user_id,NEW.id,'adjustment',ABS(NEW.current_amount-OLD.current_amount),NEW.current_amount,'Корректировка остатка через изменение карточки');
END;

CREATE TRIGGER IF NOT EXISTS trg_cash_reserve_transaction_immutable_update
BEFORE UPDATE ON cash_reserve_transactions
BEGIN
 SELECT RAISE(ABORT,'Операцию по резерву нельзя изменить: история накоплений неизменяема');
END;
CREATE TRIGGER IF NOT EXISTS trg_cash_reserve_transaction_immutable_delete
BEFORE DELETE ON cash_reserve_transactions
BEGIN
 SELECT RAISE(ABORT,'Операцию по резерву нельзя удалить: история накоплений неизменяема');
END;
