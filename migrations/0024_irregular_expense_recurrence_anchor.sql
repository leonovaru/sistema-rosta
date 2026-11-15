ALTER TABLE irregular_expenses ADD COLUMN recurrence_day INTEGER;
UPDATE irregular_expenses SET recurrence_day=CAST(substr(next_date,9,2) AS INTEGER) WHERE recurrence_day IS NULL;
