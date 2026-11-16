-- Preserve already-spent money when income allocations are edited or removed.
-- These guards also protect FK cascades (income/bucket deletion) from silently
-- erasing the funding history underneath recorded expenses and payments.

CREATE TRIGGER IF NOT EXISTS trg_bucket_allocation_validate_insert
BEFORE INSERT ON income_bucket_allocations
WHEN NOT EXISTS (
  SELECT 1 FROM income_entries i
  JOIN income_buckets b ON b.id=NEW.bucket_id AND b.user_id=NEW.user_id
  WHERE i.id=NEW.income_id AND i.user_id=NEW.user_id
)
OR NEW.amount > COALESCE((
  SELECT i.amount FROM income_entries i
  WHERE i.id=NEW.income_id AND i.user_id=NEW.user_id
),0) - COALESCE((
  SELECT SUM(a.amount) FROM income_bucket_allocations a
  WHERE a.income_id=NEW.income_id
),0) + 0.0001
BEGIN
  SELECT RAISE(ABORT,'Распределение не соответствует доходу или корзине');
END;

CREATE TRIGGER IF NOT EXISTS trg_bucket_allocation_balance_update
BEFORE UPDATE OF user_id,income_id,bucket_id,amount ON income_bucket_allocations
WHEN
  NOT EXISTS (
    SELECT 1 FROM income_entries i
    JOIN income_buckets b ON b.id=NEW.bucket_id AND b.user_id=NEW.user_id
    WHERE i.id=NEW.income_id AND i.user_id=NEW.user_id
  )
  OR NEW.amount > COALESCE((
    SELECT i.amount FROM income_entries i
    WHERE i.id=NEW.income_id AND i.user_id=NEW.user_id
  ),0) - COALESCE((
    SELECT SUM(a.amount) FROM income_bucket_allocations a
    WHERE a.income_id=NEW.income_id AND a.id<>OLD.id
  ),0) + 0.0001
  OR (
    OLD.bucket_id<>NEW.bucket_id OR OLD.user_id<>NEW.user_id
  ) AND (
    COALESCE((SELECT SUM(a.amount) FROM income_bucket_allocations a
      WHERE a.user_id=OLD.user_id AND a.bucket_id=OLD.bucket_id AND a.id<>OLD.id),0)
    - COALESCE((SELECT SUM(e.amount) FROM expenses e
      WHERE e.user_id=OLD.user_id AND e.bucket_id=OLD.bucket_id),0)
    - COALESCE((SELECT SUM(p.amount) FROM debt_payments p
      WHERE p.user_id=OLD.user_id AND p.bucket_id=OLD.bucket_id),0)
    - COALESCE((SELECT SUM(p.amount) FROM obligation_payments p
      WHERE p.user_id=OLD.user_id AND p.bucket_id=OLD.bucket_id),0)
  )+0.0001<0
  OR (
    OLD.bucket_id=NEW.bucket_id AND OLD.user_id=NEW.user_id
  ) AND (
    COALESCE((SELECT SUM(a.amount) FROM income_bucket_allocations a
      WHERE a.user_id=NEW.user_id AND a.bucket_id=NEW.bucket_id AND a.id<>OLD.id),0)
    + NEW.amount
    - COALESCE((SELECT SUM(e.amount) FROM expenses e
      WHERE e.user_id=NEW.user_id AND e.bucket_id=NEW.bucket_id),0)
    - COALESCE((SELECT SUM(p.amount) FROM debt_payments p
      WHERE p.user_id=NEW.user_id AND p.bucket_id=NEW.bucket_id),0)
    - COALESCE((SELECT SUM(p.amount) FROM obligation_payments p
      WHERE p.user_id=NEW.user_id AND p.bucket_id=NEW.bucket_id),0)
  )+0.0001<0
  OR (
    OLD.bucket_id<>NEW.bucket_id OR OLD.user_id<>NEW.user_id
  ) AND (
    COALESCE((SELECT SUM(a.amount) FROM income_bucket_allocations a
      WHERE a.user_id=NEW.user_id AND a.bucket_id=NEW.bucket_id),0)+NEW.amount
    - COALESCE((SELECT SUM(e.amount) FROM expenses e
      WHERE e.user_id=NEW.user_id AND e.bucket_id=NEW.bucket_id),0)
    - COALESCE((SELECT SUM(p.amount) FROM debt_payments p
      WHERE p.user_id=NEW.user_id AND p.bucket_id=NEW.bucket_id),0)
    - COALESCE((SELECT SUM(p.amount) FROM obligation_payments p
      WHERE p.user_id=NEW.user_id AND p.bucket_id=NEW.bucket_id),0)
  )+0.0001<0
BEGIN
  SELECT RAISE(ABORT,'Нельзя изменить распределение: в корзине уже использованы эти деньги');
END;

CREATE TRIGGER IF NOT EXISTS trg_bucket_allocation_balance_delete
BEFORE DELETE ON income_bucket_allocations
WHEN (
  COALESCE((SELECT SUM(a.amount) FROM income_bucket_allocations a
    WHERE a.user_id=OLD.user_id AND a.bucket_id=OLD.bucket_id AND a.id<>OLD.id),0)
  - COALESCE((SELECT SUM(e.amount) FROM expenses e
    WHERE e.user_id=OLD.user_id AND e.bucket_id=OLD.bucket_id),0)
  - COALESCE((SELECT SUM(p.amount) FROM debt_payments p
    WHERE p.user_id=OLD.user_id AND p.bucket_id=OLD.bucket_id),0)
  - COALESCE((SELECT SUM(p.amount) FROM obligation_payments p
    WHERE p.user_id=OLD.user_id AND p.bucket_id=OLD.bucket_id),0)
)+0.0001<0
BEGIN
  SELECT RAISE(ABORT,'Нельзя удалить распределение: в корзине уже использованы эти деньги');
END;

CREATE TRIGGER IF NOT EXISTS trg_income_amount_allocation_guard
BEFORE UPDATE OF amount ON income_entries
WHEN COALESCE((
  SELECT SUM(a.amount) FROM income_bucket_allocations a
  WHERE a.income_id=OLD.id AND a.user_id=OLD.user_id
),0)>NEW.amount+0.0001
BEGIN
  SELECT RAISE(ABORT,'Сумма дохода меньше уже распределенных средств');
END;
