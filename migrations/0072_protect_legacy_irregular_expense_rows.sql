-- Preserve legacy expense rows that could not be linked to a single payment
-- during migration 0064. Their exact amount/date/note match is still evidence
-- that deleting the expense would erase a historical financial fact.
DROP TRIGGER IF EXISTS trg_irregular_payment_expense_immutable_delete;

CREATE TRIGGER trg_irregular_payment_expense_immutable_delete
BEFORE DELETE ON expenses
WHEN EXISTS(
 SELECT 1
 FROM irregular_expense_payments p
 WHERE p.user_id=OLD.user_id
  AND (
   p.expense_id=OLD.id
   OR (
    p.expense_id IS NULL
    AND OLD.note='Оплата нерегулярного расхода'
    AND p.amount=OLD.amount
    AND p.paid_on=OLD.spent_on
   )
  )
)
BEGIN
 SELECT RAISE(ABORT,'Расход по оплате нерегулярного платежа нельзя удалить: история неизменяема');
END;
