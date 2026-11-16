-- Irregular-expense payments are historical facts. Retire the schedule instead
-- of cascading away its payment history; corrections require a separate entry.

CREATE TRIGGER IF NOT EXISTS trg_irregular_expense_payment_immutable_update
BEFORE UPDATE ON irregular_expense_payments
BEGIN
 SELECT RAISE(ABORT,'Оплату нерегулярного расхода нельзя изменить: история оплат неизменяема');
END;

CREATE TRIGGER IF NOT EXISTS trg_irregular_expense_payment_immutable_delete
BEFORE DELETE ON irregular_expense_payments
BEGIN
 SELECT RAISE(ABORT,'Оплату нерегулярного расхода нельзя удалить: история оплат неизменяема');
END;
