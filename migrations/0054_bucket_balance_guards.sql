-- Bucket balance checks at the database boundary prevent concurrent requests
-- from spending the same unallocated balance more than once.
CREATE TRIGGER IF NOT EXISTS trg_bucket_expense_balance_insert
BEFORE INSERT ON expenses
WHEN NEW.bucket_id IS NOT NULL
 AND NOT EXISTS (
  SELECT 1 FROM income_buckets b
  WHERE b.id=NEW.bucket_id AND b.user_id=NEW.user_id
    AND (
      COALESCE((SELECT SUM(a.amount) FROM income_bucket_allocations a
        WHERE a.user_id=NEW.user_id AND a.bucket_id=NEW.bucket_id),0)
      - COALESCE((SELECT SUM(e.amount) FROM expenses e
        WHERE e.user_id=NEW.user_id AND e.bucket_id=NEW.bucket_id),0)
      - COALESCE((SELECT SUM(p.amount) FROM debt_payments p
        WHERE p.user_id=NEW.user_id AND p.bucket_id=NEW.bucket_id),0)
      - COALESCE((SELECT SUM(p.amount) FROM obligation_payments p
        WHERE p.user_id=NEW.user_id AND p.bucket_id=NEW.bucket_id),0)
    )+0.0001>=NEW.amount
 )
BEGIN
 SELECT RAISE(ABORT,'Недостаточно средств в корзине');
END;

CREATE TRIGGER IF NOT EXISTS trg_bucket_expense_balance_update
BEFORE UPDATE OF amount,bucket_id,user_id ON expenses
WHEN NEW.bucket_id IS NOT NULL
 AND NOT EXISTS (
  SELECT 1 FROM income_buckets b
  WHERE b.id=NEW.bucket_id AND b.user_id=NEW.user_id
    AND (
      COALESCE((SELECT SUM(a.amount) FROM income_bucket_allocations a
        WHERE a.user_id=NEW.user_id AND a.bucket_id=NEW.bucket_id),0)
      - COALESCE((SELECT SUM(e.amount) FROM expenses e
        WHERE e.user_id=NEW.user_id AND e.bucket_id=NEW.bucket_id AND e.id<>OLD.id),0)
      - COALESCE((SELECT SUM(p.amount) FROM debt_payments p
        WHERE p.user_id=NEW.user_id AND p.bucket_id=NEW.bucket_id),0)
      - COALESCE((SELECT SUM(p.amount) FROM obligation_payments p
        WHERE p.user_id=NEW.user_id AND p.bucket_id=NEW.bucket_id),0)
    )+0.0001>=NEW.amount
 )
BEGIN
 SELECT RAISE(ABORT,'Недостаточно средств в корзине');
END;

CREATE TRIGGER IF NOT EXISTS trg_bucket_debt_payment_balance_insert
BEFORE INSERT ON debt_payments
WHEN NEW.bucket_id IS NOT NULL
 AND NOT EXISTS (
  SELECT 1 FROM income_buckets b
  WHERE b.id=NEW.bucket_id AND b.user_id=NEW.user_id
    AND (
      COALESCE((SELECT SUM(a.amount) FROM income_bucket_allocations a
        WHERE a.user_id=NEW.user_id AND a.bucket_id=NEW.bucket_id),0)
      - COALESCE((SELECT SUM(e.amount) FROM expenses e
        WHERE e.user_id=NEW.user_id AND e.bucket_id=NEW.bucket_id),0)
      - COALESCE((SELECT SUM(p.amount) FROM debt_payments p
        WHERE p.user_id=NEW.user_id AND p.bucket_id=NEW.bucket_id),0)
      - COALESCE((SELECT SUM(p.amount) FROM obligation_payments p
        WHERE p.user_id=NEW.user_id AND p.bucket_id=NEW.bucket_id),0)
    )+0.0001>=NEW.amount
 )
BEGIN
 SELECT RAISE(ABORT,'Недостаточно средств в корзине');
END;

CREATE TRIGGER IF NOT EXISTS trg_bucket_debt_payment_balance_update
BEFORE UPDATE OF amount,bucket_id,user_id ON debt_payments
WHEN NEW.bucket_id IS NOT NULL
 AND NOT EXISTS (
  SELECT 1 FROM income_buckets b
  WHERE b.id=NEW.bucket_id AND b.user_id=NEW.user_id
    AND (
      COALESCE((SELECT SUM(a.amount) FROM income_bucket_allocations a
        WHERE a.user_id=NEW.user_id AND a.bucket_id=NEW.bucket_id),0)
      - COALESCE((SELECT SUM(e.amount) FROM expenses e
        WHERE e.user_id=NEW.user_id AND e.bucket_id=NEW.bucket_id),0)
      - COALESCE((SELECT SUM(p.amount) FROM debt_payments p
        WHERE p.user_id=NEW.user_id AND p.bucket_id=NEW.bucket_id AND p.id<>OLD.id),0)
      - COALESCE((SELECT SUM(p.amount) FROM obligation_payments p
        WHERE p.user_id=NEW.user_id AND p.bucket_id=NEW.bucket_id),0)
    )+0.0001>=NEW.amount
 )
BEGIN
 SELECT RAISE(ABORT,'Недостаточно средств в корзине');
END;

CREATE TRIGGER IF NOT EXISTS trg_bucket_obligation_payment_balance_insert
BEFORE INSERT ON obligation_payments
WHEN NEW.bucket_id IS NOT NULL
 AND NOT EXISTS (
  SELECT 1 FROM income_buckets b
  WHERE b.id=NEW.bucket_id AND b.user_id=NEW.user_id
    AND (
      COALESCE((SELECT SUM(a.amount) FROM income_bucket_allocations a
        WHERE a.user_id=NEW.user_id AND a.bucket_id=NEW.bucket_id),0)
      - COALESCE((SELECT SUM(e.amount) FROM expenses e
        WHERE e.user_id=NEW.user_id AND e.bucket_id=NEW.bucket_id),0)
      - COALESCE((SELECT SUM(p.amount) FROM debt_payments p
        WHERE p.user_id=NEW.user_id AND p.bucket_id=NEW.bucket_id),0)
      - COALESCE((SELECT SUM(p.amount) FROM obligation_payments p
        WHERE p.user_id=NEW.user_id AND p.bucket_id=NEW.bucket_id),0)
    )+0.0001>=NEW.amount
 )
BEGIN
 SELECT RAISE(ABORT,'Недостаточно средств в корзине');
END;

CREATE TRIGGER IF NOT EXISTS trg_bucket_obligation_payment_balance_update
BEFORE UPDATE OF amount,bucket_id,user_id ON obligation_payments
WHEN NEW.bucket_id IS NOT NULL
 AND NOT EXISTS (
  SELECT 1 FROM income_buckets b
  WHERE b.id=NEW.bucket_id AND b.user_id=NEW.user_id
    AND (
      COALESCE((SELECT SUM(a.amount) FROM income_bucket_allocations a
        WHERE a.user_id=NEW.user_id AND a.bucket_id=NEW.bucket_id),0)
      - COALESCE((SELECT SUM(e.amount) FROM expenses e
        WHERE e.user_id=NEW.user_id AND e.bucket_id=NEW.bucket_id),0)
      - COALESCE((SELECT SUM(p.amount) FROM debt_payments p
        WHERE p.user_id=NEW.user_id AND p.bucket_id=NEW.bucket_id),0)
      - COALESCE((SELECT SUM(p.amount) FROM obligation_payments p
        WHERE p.user_id=NEW.user_id AND p.bucket_id=NEW.bucket_id AND p.id<>OLD.id),0)
    )+0.0001>=NEW.amount
 )
BEGIN
 SELECT RAISE(ABORT,'Недостаточно средств в корзине');
END;
