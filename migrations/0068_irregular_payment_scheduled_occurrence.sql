-- The payment date is not necessarily the scheduled occurrence date.
-- Replace the earlier same-paid_on guard: multiple overdue occurrences may
-- legitimately be paid on the same calendar day.
DROP TRIGGER IF EXISTS trg_irregular_expense_payment_unique_occurrence;
-- Keep historical records NULL: their original scheduled date cannot be
-- reliably reconstructed from paid_on alone.
ALTER TABLE irregular_expense_payments ADD COLUMN scheduled_due_date TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_irregular_payment_scheduled_occurrence
 ON irregular_expense_payments(irregular_expense_id,scheduled_due_date)
 WHERE scheduled_due_date IS NOT NULL;
