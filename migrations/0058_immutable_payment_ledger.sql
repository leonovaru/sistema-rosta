-- Financial ledger rows are not editable in place. Expense deletion remains
-- supported (and restores bucket availability); payment corrections require an
-- explicit compensating operation rather than rewriting historical facts.

CREATE TRIGGER IF NOT EXISTS trg_debt_payment_immutable_update
BEFORE UPDATE ON debt_payments
BEGIN
  SELECT RAISE(ABORT,'Платёж по долгу нельзя изменить: добавь корректирующую операцию');
END;

CREATE TRIGGER IF NOT EXISTS trg_debt_payment_immutable_delete
BEFORE DELETE ON debt_payments
BEGIN
  SELECT RAISE(ABORT,'Платёж по долгу нельзя удалить: история погашения неизменяема');
END;

CREATE TRIGGER IF NOT EXISTS trg_obligation_payment_immutable_update
BEFORE UPDATE ON obligation_payments
BEGIN
  SELECT RAISE(ABORT,'Платёж по обязательству нельзя изменить: история оплат неизменяема');
END;

CREATE TRIGGER IF NOT EXISTS trg_obligation_payment_immutable_delete
BEFORE DELETE ON obligation_payments
BEGIN
  SELECT RAISE(ABORT,'Платёж по обязательству нельзя удалить: история оплат неизменяема');
END;
