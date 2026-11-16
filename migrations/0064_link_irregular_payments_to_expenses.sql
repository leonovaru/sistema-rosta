-- Link each recurring/irregular payment to its actual expense row so the
-- immutable payment ledger cannot drift away from monthly totals or bucket balances.
ALTER TABLE irregular_expense_payments ADD COLUMN expense_id TEXT REFERENCES expenses(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_irregular_expense_payments_expense ON irregular_expense_payments(expense_id) WHERE expense_id IS NOT NULL;

-- Backfill only unambiguous historical pairs: exactly one payment and one
-- matching expense for the same user, amount, date and generated-note marker.
UPDATE irregular_expense_payments
SET expense_id=(
 SELECT e.id FROM expenses e
 WHERE e.user_id=irregular_expense_payments.user_id
  AND e.amount=irregular_expense_payments.amount
  AND e.spent_on=irregular_expense_payments.paid_on
  AND e.note='Оплата нерегулярного расхода'
  AND (SELECT COUNT(*) FROM expenses e2 WHERE e2.user_id=e.user_id AND e2.amount=e.amount AND e2.spent_on=e.spent_on AND e2.note=e.note)=1
)
WHERE expense_id IS NULL
 AND (SELECT COUNT(*) FROM irregular_expense_payments p2 WHERE p2.user_id=irregular_expense_payments.user_id AND p2.amount=irregular_expense_payments.amount AND p2.paid_on=irregular_expense_payments.paid_on)=1;

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
WHEN EXISTS(SELECT 1 FROM irregular_expense_payments p WHERE p.user_id=OLD.user_id AND (p.expense_id=OLD.id OR (p.expense_id IS NULL AND OLD.note='Оплата нерегулярного расхода' AND p.amount=OLD.amount AND p.paid_on=OLD.spent_on)))
BEGIN
 SELECT RAISE(ABORT,'Расход по оплате нерегулярного платежа нельзя изменить: история неизменяема');
END;

CREATE TRIGGER IF NOT EXISTS trg_irregular_payment_expense_immutable_delete
BEFORE DELETE ON expenses
WHEN EXISTS(SELECT 1 FROM irregular_expense_payments p WHERE p.expense_id=OLD.id AND p.user_id=OLD.user_id)
BEGIN
 SELECT RAISE(ABORT,'Расход по оплате нерегулярного платежа нельзя удалить: история неизменяема');
END;
