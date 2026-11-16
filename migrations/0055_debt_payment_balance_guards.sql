-- Serialize debt repayment against the current balance. The trigger is the
-- authoritative balance mutation, so concurrent payments cannot both subtract
-- from the same stale balance read by the API.
CREATE TRIGGER IF NOT EXISTS trg_debt_payment_balance_before_insert
BEFORE INSERT ON debt_payments
WHEN NOT EXISTS (
  SELECT 1 FROM debts d
  WHERE d.id=NEW.debt_id
    AND d.user_id=NEW.user_id
    AND d.status='open'
    AND d.balance+0.0001>=NEW.amount
)
BEGIN
  SELECT RAISE(ABORT,'Платёж превышает текущий остаток долга или долг уже закрыт');
END;

CREATE TRIGGER IF NOT EXISTS trg_debt_payment_balance_after_insert
AFTER INSERT ON debt_payments
BEGIN
  UPDATE debts
  SET balance=MAX(0,balance-NEW.amount),
      status=CASE WHEN balance-NEW.amount<=0.0001 THEN 'closed' ELSE 'open' END,
      updated_at=datetime('now')
  WHERE id=NEW.debt_id
    AND user_id=NEW.user_id;
END;
