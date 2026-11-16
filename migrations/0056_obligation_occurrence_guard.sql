-- Keep one payment per scheduled occurrence. Legacy rows stay nullable because
-- their original scheduled due date cannot be reconstructed reliably.
ALTER TABLE obligation_payments ADD COLUMN scheduled_due_date TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_obligation_payments_occurrence
  ON obligation_payments(obligation_id,scheduled_due_date)
  WHERE scheduled_due_date IS NOT NULL;
