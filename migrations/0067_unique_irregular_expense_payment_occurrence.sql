-- Prevent two concurrent "paid" actions from recording the same scheduled
-- irregular-expense occurrence. Existing historical rows are left untouched.
CREATE TRIGGER IF NOT EXISTS trg_irregular_expense_payment_unique_occurrence
BEFORE INSERT ON irregular_expense_payments
WHEN EXISTS (
 SELECT 1 FROM irregular_expense_payments p
 WHERE p.irregular_expense_id=NEW.irregular_expense_id
  AND p.paid_on=NEW.paid_on
)
BEGIN
 SELECT RAISE(ABORT,'Оплата за эту дату уже зарегистрирована');
END;
