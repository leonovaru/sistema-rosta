-- Link each recurring/irregular payment to its actual expense row so the
-- immutable payment ledger cannot drift away from monthly totals or bucket balances.
ALTER TABLE irregular_expense_payments ADD COLUMN expense_id TEXT REFERENCES expenses(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_irregular_expense_payments_expense ON irregular_expense_payments(expense_id) WHERE expense_id IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS trg_irregular_payment_expense_owner_insert
BEFORE INSERT ON irregular_expense_payments
WHEN NEW.expense_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM expenses e WHERE e.id=NEW.expense_id AND e.user_id=NEW.user_id
)
BEGIN
 SELECT RAISE(ABORT,'Оплата должна быть связана с расходом этого пользователя');
END;

CREATE TRIGGER IF NOT EXISTS trg_irregular_payment_expense_immutable_update
BEFORE UPDATE ON expenses
WHEN EXISTS(SELECT 1 FROM irregular_expense_payments p WHERE p.expense_id=OLD.id AND p.user_id=OLD.user_id)
BEGIN
 SELECT RAISE(ABORT,'Расход по оплате нерегулярного платежа нельзя изменить: история неизменяема');
END;

CREATE TRIGGER IF NOT EXISTS trg_irregular_payment_expense_immutable_delete
BEFORE DELETE ON expenses
WHEN EXISTS(SELECT 1 FROM irregular_expense_payments p WHERE p.expense_id=OLD.id AND p.user_id=OLD.user_id)
BEGIN
 SELECT RAISE(ABORT,'Расход по оплате нерегулярного платежа нельзя удалить: история неизменяема');
END;
