CREATE TABLE IF NOT EXISTS bucket_funding_transfers(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,source_bucket_id TEXT NOT NULL REFERENCES income_buckets(id) ON DELETE RESTRICT,target_type TEXT NOT NULL CHECK(target_type IN('goal','reserve')),target_id TEXT NOT NULL,amount REAL NOT NULL CHECK(amount>0),transferred_on TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',request_id TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT(datetime('now')),UNIQUE(user_id,request_id));
CREATE TABLE IF NOT EXISTS bucket_funding_transfer_reversals(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,transfer_id TEXT NOT NULL REFERENCES bucket_funding_transfers(id) ON DELETE RESTRICT,amount REAL NOT NULL CHECK(amount>0),reversed_on TEXT NOT NULL,reason TEXT NOT NULL,request_id TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT(datetime('now')),UNIQUE(user_id,request_id),UNIQUE(transfer_id));
CREATE INDEX IF NOT EXISTS idx_funding_transfer_source ON bucket_funding_transfers(user_id,source_bucket_id);
CREATE INDEX IF NOT EXISTS idx_funding_transfer_target ON bucket_funding_transfers(user_id,target_type,target_id);
CREATE VIEW IF NOT EXISTS bucket_funding_transfer_net AS SELECT t.user_id,t.source_bucket_id,SUM(t.amount-COALESCE(r.amount,0)) amount FROM bucket_funding_transfers t LEFT JOIN bucket_funding_transfer_reversals r ON r.transfer_id=t.id GROUP BY t.user_id,t.source_bucket_id;

CREATE TRIGGER IF NOT EXISTS trg_funding_transfer_validate BEFORE INSERT ON bucket_funding_transfers
WHEN NOT EXISTS(SELECT 1 FROM income_buckets b WHERE b.id=NEW.source_bucket_id AND b.user_id=NEW.user_id AND b.active=1)
OR (COALESCE((SELECT SUM(a.amount) FROM income_bucket_allocations a WHERE a.user_id=NEW.user_id AND a.bucket_id=NEW.source_bucket_id),0)
-COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.user_id=NEW.user_id AND e.bucket_id=NEW.source_bucket_id),0)
+COALESCE((SELECT SUM(r.amount) FROM irregular_expense_payment_reversals r JOIN expenses e ON e.id=r.expense_id WHERE r.user_id=NEW.user_id AND e.bucket_id=NEW.source_bucket_id),0)
-COALESCE((SELECT amount FROM debt_payment_bucket_net WHERE user_id=NEW.user_id AND bucket_id=NEW.source_bucket_id),0)
-COALESCE((SELECT amount FROM obligation_payment_bucket_net WHERE user_id=NEW.user_id AND bucket_id=NEW.source_bucket_id),0)
-COALESCE((SELECT amount FROM bucket_funding_transfer_net WHERE user_id=NEW.user_id AND source_bucket_id=NEW.source_bucket_id),0))+0.0001<NEW.amount
BEGIN SELECT RAISE(ABORT,'Недостаточно средств в корзине для перевода'); END;

CREATE TRIGGER IF NOT EXISTS trg_funding_transfer_target BEFORE INSERT ON bucket_funding_transfers
WHEN (NEW.target_type='goal' AND NOT EXISTS(SELECT 1 FROM financial_goals WHERE id=NEW.target_id AND user_id=NEW.user_id AND status IN('active','paused')))
OR (NEW.target_type='reserve' AND NOT EXISTS(SELECT 1 FROM cash_reserves WHERE id=NEW.target_id AND user_id=NEW.user_id AND active=1 AND current_amount+NEW.amount<=target_amount+0.0001))
BEGIN SELECT RAISE(ABORT,'Цель или резерв недоступны либо превышена целевая сумма'); END;

CREATE TRIGGER IF NOT EXISTS trg_funding_transfer_reserve AFTER INSERT ON bucket_funding_transfers WHEN NEW.target_type='reserve'
BEGIN
 UPDATE cash_reserves SET current_amount=ROUND(current_amount+NEW.amount,2),updated_at=datetime('now') WHERE id=NEW.target_id AND user_id=NEW.user_id;
 INSERT INTO cash_reserve_transactions(id,user_id,reserve_id,transaction_type,amount,balance_after,note) SELECT 'transfer-'||NEW.id,NEW.user_id,NEW.target_id,'contribution',NEW.amount,current_amount,'Перевод из корзины: '||NEW.note FROM cash_reserves WHERE id=NEW.target_id AND user_id=NEW.user_id;
END;
CREATE TRIGGER IF NOT EXISTS trg_funding_reversal_validate BEFORE INSERT ON bucket_funding_transfer_reversals
WHEN NOT EXISTS(SELECT 1 FROM bucket_funding_transfers WHERE id=NEW.transfer_id AND user_id=NEW.user_id AND ABS(amount-NEW.amount)<0.0001)
BEGIN SELECT RAISE(ABORT,'Перевод не найден или сумма отмены не совпадает'); END;
CREATE TRIGGER IF NOT EXISTS trg_funding_reversal_reserve AFTER INSERT ON bucket_funding_transfer_reversals
WHEN (SELECT target_type FROM bucket_funding_transfers WHERE id=NEW.transfer_id)='reserve'
BEGIN
 UPDATE cash_reserves SET current_amount=ROUND(current_amount-NEW.amount,2),updated_at=datetime('now') WHERE id=(SELECT target_id FROM bucket_funding_transfers WHERE id=NEW.transfer_id) AND user_id=NEW.user_id;
 INSERT INTO cash_reserve_transactions(id,user_id,reserve_id,transaction_type,amount,balance_after,note) SELECT 'transfer-reversal-'||NEW.id,NEW.user_id,r.id,'withdrawal',NEW.amount,r.current_amount,'Отмена перевода: '||NEW.reason FROM cash_reserves r JOIN bucket_funding_transfers t ON t.target_id=r.id AND t.target_type='reserve' WHERE t.id=NEW.transfer_id AND r.user_id=NEW.user_id;
END;
CREATE TRIGGER IF NOT EXISTS trg_funding_transfer_no_update BEFORE UPDATE ON bucket_funding_transfers BEGIN SELECT RAISE(ABORT,'Перевод нельзя изменить'); END;
CREATE TRIGGER IF NOT EXISTS trg_funding_transfer_no_delete BEFORE DELETE ON bucket_funding_transfers BEGIN SELECT RAISE(ABORT,'Перевод нельзя удалить'); END;
CREATE TRIGGER IF NOT EXISTS trg_funding_reversal_no_update BEFORE UPDATE ON bucket_funding_transfer_reversals BEGIN SELECT RAISE(ABORT,'Отмену перевода нельзя изменить'); END;
CREATE TRIGGER IF NOT EXISTS trg_funding_reversal_no_delete BEFORE DELETE ON bucket_funding_transfer_reversals BEGIN SELECT RAISE(ABORT,'Отмену перевода нельзя удалить'); END;

-- Any later expense/payment must leave enough money for prior transfers.
CREATE TRIGGER IF NOT EXISTS trg_funding_transfer_spend_guard_expense BEFORE INSERT ON expenses WHEN NEW.bucket_id IS NOT NULL AND COALESCE((SELECT amount FROM bucket_funding_transfer_net WHERE user_id=NEW.user_id AND source_bucket_id=NEW.bucket_id),0)>COALESCE((SELECT SUM(a.amount) FROM income_bucket_allocations a WHERE a.user_id=NEW.user_id AND a.bucket_id=NEW.bucket_id),0)-COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.user_id=NEW.user_id AND e.bucket_id=NEW.bucket_id),0)+COALESCE((SELECT SUM(r.amount) FROM irregular_expense_payment_reversals r JOIN expenses e ON e.id=r.expense_id WHERE r.user_id=NEW.user_id AND e.bucket_id=NEW.bucket_id),0)-COALESCE((SELECT amount FROM debt_payment_bucket_net WHERE user_id=NEW.user_id AND bucket_id=NEW.bucket_id),0)-COALESCE((SELECT amount FROM obligation_payment_bucket_net WHERE user_id=NEW.user_id AND bucket_id=NEW.bucket_id),0)-NEW.amount+0.0001
BEGIN SELECT RAISE(ABORT,'Средства уже переведены из корзины'); END;
CREATE TRIGGER IF NOT EXISTS trg_funding_transfer_spend_guard_debt BEFORE INSERT ON debt_payments WHEN NEW.bucket_id IS NOT NULL AND COALESCE((SELECT amount FROM bucket_funding_transfer_net WHERE user_id=NEW.user_id AND source_bucket_id=NEW.bucket_id),0)>COALESCE((SELECT SUM(a.amount) FROM income_bucket_allocations a WHERE a.user_id=NEW.user_id AND a.bucket_id=NEW.bucket_id),0)-COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.user_id=NEW.user_id AND e.bucket_id=NEW.bucket_id),0)+COALESCE((SELECT SUM(r.amount) FROM irregular_expense_payment_reversals r JOIN expenses e ON e.id=r.expense_id WHERE r.user_id=NEW.user_id AND e.bucket_id=NEW.bucket_id),0)-COALESCE((SELECT amount FROM debt_payment_bucket_net WHERE user_id=NEW.user_id AND bucket_id=NEW.bucket_id),0)-COALESCE((SELECT amount FROM obligation_payment_bucket_net WHERE user_id=NEW.user_id AND bucket_id=NEW.bucket_id),0)-NEW.amount+0.0001
BEGIN SELECT RAISE(ABORT,'Средства уже переведены из корзины'); END;
CREATE TRIGGER IF NOT EXISTS trg_funding_transfer_spend_guard_obligation BEFORE INSERT ON obligation_payments WHEN NEW.bucket_id IS NOT NULL AND COALESCE((SELECT amount FROM bucket_funding_transfer_net WHERE user_id=NEW.user_id AND source_bucket_id=NEW.bucket_id),0)>COALESCE((SELECT SUM(a.amount) FROM income_bucket_allocations a WHERE a.user_id=NEW.user_id AND a.bucket_id=NEW.bucket_id),0)-COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.user_id=NEW.user_id AND e.bucket_id=NEW.bucket_id),0)+COALESCE((SELECT SUM(r.amount) FROM irregular_expense_payment_reversals r JOIN expenses e ON e.id=r.expense_id WHERE r.user_id=NEW.user_id AND e.bucket_id=NEW.bucket_id),0)-COALESCE((SELECT amount FROM debt_payment_bucket_net WHERE user_id=NEW.user_id AND bucket_id=NEW.bucket_id),0)-COALESCE((SELECT amount FROM obligation_payment_bucket_net WHERE user_id=NEW.user_id AND bucket_id=NEW.bucket_id),0)-NEW.amount+0.0001
BEGIN SELECT RAISE(ABORT,'Средства уже переведены из корзины'); END;
