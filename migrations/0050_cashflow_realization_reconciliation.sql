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
