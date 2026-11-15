-- Keep a planned payment's execution state consistent when a linked
-- income/expense is deleted and its realization row is removed by FK cascade.
CREATE TRIGGER IF NOT EXISTS trg_cashflow_realization_after_delete
AFTER DELETE ON planned_cashflow_realizations
BEGIN
  UPDATE planned_cashflows
  SET status = CASE
    WHEN status='cancelled' THEN 'cancelled'
    WHEN COALESCE((
      SELECT SUM(amount)
      FROM planned_cashflow_realizations
      WHERE planned_cashflow_id=OLD.planned_cashflow_id
        AND user_id=OLD.user_id
    ),0) >= amount-0.005 THEN 'realized'
    ELSE 'planned'
  END
  WHERE id=OLD.planned_cashflow_id
    AND user_id=OLD.user_id
    AND archived_at IS NULL;
END;

-- Recalculate completion when a realization amount or its parent plan changes.
CREATE TRIGGER IF NOT EXISTS trg_cashflow_realization_after_update
AFTER UPDATE OF amount,planned_cashflow_id ON planned_cashflow_realizations
BEGIN
  UPDATE planned_cashflows
  SET status = CASE
    WHEN status='cancelled' THEN 'cancelled'
    WHEN COALESCE((
      SELECT SUM(amount)
      FROM planned_cashflow_realizations
      WHERE planned_cashflow_id=NEW.planned_cashflow_id
        AND user_id=NEW.user_id
    ),0) >= amount-0.005 THEN 'realized'
    ELSE 'planned'
  END
  WHERE id=NEW.planned_cashflow_id
    AND user_id=NEW.user_id
    AND archived_at IS NULL;
END;

-- Keep linked income realizations synchronized with the source operation.
-- Reject increases that would make the plan's linked total exceed its amount.
CREATE TRIGGER IF NOT EXISTS trg_cashflow_income_amount_guard
BEFORE UPDATE OF amount ON income_entries
WHEN EXISTS (
  SELECT 1 FROM planned_cashflow_realizations r
  JOIN planned_cashflows p ON p.id=r.planned_cashflow_id AND p.user_id=r.user_id
  WHERE r.income_entry_id=OLD.id
    AND NEW.amount > p.amount - (
      SELECT COALESCE(SUM(other.amount),0)
      FROM planned_cashflow_realizations other
      WHERE other.planned_cashflow_id=r.planned_cashflow_id
        AND other.user_id=r.user_id
        AND other.id<>r.id
    ) + 0.005
)
BEGIN
  SELECT RAISE(ABORT, 'Изменение суммы превысит плановый платёж');
END;

CREATE TRIGGER IF NOT EXISTS trg_cashflow_income_amount_sync
AFTER UPDATE OF amount ON income_entries
WHEN NEW.amount<>OLD.amount
BEGIN
  UPDATE planned_cashflow_realizations
  SET amount=NEW.amount
  WHERE income_entry_id=NEW.id;
END;

-- The same protection and synchronization for linked expenses.
CREATE TRIGGER IF NOT EXISTS trg_cashflow_expense_amount_guard
BEFORE UPDATE OF amount ON expenses
WHEN EXISTS (
  SELECT 1 FROM planned_cashflow_realizations r
  JOIN planned_cashflows p ON p.id=r.planned_cashflow_id AND p.user_id=r.user_id
  WHERE r.expense_id=OLD.id
    AND NEW.amount > p.amount - (
      SELECT COALESCE(SUM(other.amount),0)
      FROM planned_cashflow_realizations other
      WHERE other.planned_cashflow_id=r.planned_cashflow_id
        AND other.user_id=r.user_id
        AND other.id<>r.id
    ) + 0.005
)
BEGIN
  SELECT RAISE(ABORT, 'Изменение суммы превысит плановый платёж');
END;

CREATE TRIGGER IF NOT EXISTS trg_cashflow_expense_amount_sync
AFTER UPDATE OF amount ON expenses
WHEN NEW.amount<>OLD.amount
BEGIN
  UPDATE planned_cashflow_realizations
  SET amount=NEW.amount
  WHERE expense_id=NEW.id;
END;
