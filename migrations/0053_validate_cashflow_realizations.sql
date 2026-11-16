-- A realization is a factual link, not a manually editable amount.
-- Enforce the relationship at the database boundary as well as in the API.
CREATE TRIGGER IF NOT EXISTS trg_cashflow_realization_validate_insert
BEFORE INSERT ON planned_cashflow_realizations
WHEN NOT EXISTS (
  SELECT 1
  FROM planned_cashflows p
  WHERE p.id=NEW.planned_cashflow_id
    AND p.user_id=NEW.user_id
    AND p.archived_at IS NULL
    AND p.status<>'cancelled'
    AND (
      (NEW.income_entry_id IS NOT NULL
       AND p.flow_type='income'
       AND EXISTS (
         SELECT 1 FROM income_entries i
         WHERE i.id=NEW.income_entry_id
           AND i.user_id=NEW.user_id
           AND (i.project_id=p.project_id OR i.project_id_snapshot=p.project_id)
           AND ABS(i.amount-NEW.amount)<=0.005
       ))
      OR
      (NEW.expense_id IS NOT NULL
       AND p.flow_type='expense'
       AND EXISTS (
         SELECT 1 FROM expenses e
         WHERE e.id=NEW.expense_id
           AND e.user_id=NEW.user_id
           AND (e.project_id=p.project_id OR e.project_id_snapshot=p.project_id)
           AND ABS(e.amount-NEW.amount)<=0.005
       ))
    )
)
BEGIN
  SELECT RAISE(ABORT, 'Связь не соответствует фактической операции');
END;

CREATE TRIGGER IF NOT EXISTS trg_cashflow_realization_validate_update
BEFORE UPDATE OF user_id,planned_cashflow_id,income_entry_id,expense_id,amount
ON planned_cashflow_realizations
WHEN NOT EXISTS (
  SELECT 1
  FROM planned_cashflows p
  WHERE p.id=NEW.planned_cashflow_id
    AND p.user_id=NEW.user_id
    AND p.archived_at IS NULL
    AND p.status<>'cancelled'
    AND (
      (NEW.income_entry_id IS NOT NULL
       AND NEW.expense_id IS NULL
       AND p.flow_type='income'
       AND EXISTS (
         SELECT 1 FROM income_entries i
         WHERE i.id=NEW.income_entry_id
           AND i.user_id=NEW.user_id
           AND (i.project_id=p.project_id OR i.project_id_snapshot=p.project_id)
           AND ABS(i.amount-NEW.amount)<=0.005
       ))
      OR
      (NEW.expense_id IS NOT NULL
       AND NEW.income_entry_id IS NULL
       AND p.flow_type='expense'
       AND EXISTS (
         SELECT 1 FROM expenses e
         WHERE e.id=NEW.expense_id
           AND e.user_id=NEW.user_id
           AND (e.project_id=p.project_id OR e.project_id_snapshot=p.project_id)
           AND ABS(e.amount-NEW.amount)<=0.005
       ))
    )
)
BEGIN
  SELECT RAISE(ABORT, 'Связь не соответствует фактической операции');
END;
