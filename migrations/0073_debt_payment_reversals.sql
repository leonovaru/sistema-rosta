-- A debt-payment correction is a full compensating event. The source payment
-- remains immutable; the reversal restores debt principal and its original bucket.
CREATE TABLE IF NOT EXISTS debt_payment_reversals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  debt_payment_id TEXT NOT NULL UNIQUE REFERENCES debt_payments(id) ON DELETE RESTRICT,
  amount REAL NOT NULL CHECK(amount > 0),
  reversed_on TEXT NOT NULL,
  reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 3 AND 500),
  request_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_debt_payment_reversals_user_date
  ON debt_payment_reversals(user_id,reversed_on);
CREATE UNIQUE INDEX IF NOT EXISTS idx_debt_payment_reversals_request
  ON debt_payment_reversals(user_id,request_id) WHERE request_id IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS trg_debt_payment_reversal_before_insert
BEFORE INSERT ON debt_payment_reversals
WHEN NOT EXISTS (
  SELECT 1 FROM debt_payments p
  JOIN debts d ON d.id=p.debt_id AND d.user_id=p.user_id
  WHERE p.id=NEW.debt_payment_id
    AND p.user_id=NEW.user_id
    AND ABS(p.amount-NEW.amount)<0.0001
)
BEGIN
  SELECT RAISE(ABORT,'Исходный платёж не найден или сумма корректировки не совпадает');
END;

CREATE TRIGGER IF NOT EXISTS trg_debt_payment_reversal_after_insert
AFTER INSERT ON debt_payment_reversals
BEGIN
  UPDATE debts
  SET balance=balance+NEW.amount,
      status='open',
      updated_at=datetime('now')
  WHERE id=(SELECT debt_id FROM debt_payments WHERE id=NEW.debt_payment_id)
    AND user_id=NEW.user_id;
END;

DROP TRIGGER IF EXISTS trg_debt_payment_reversal_immutable_update;
CREATE TRIGGER trg_debt_payment_reversal_immutable_update_v2
BEFORE UPDATE ON debt_payment_reversals
BEGIN
  SELECT RAISE(ABORT,'Корректировку платежа нельзя изменить');
END;
DROP TRIGGER IF EXISTS trg_debt_payment_reversal_immutable_delete;
CREATE TRIGGER trg_debt_payment_reversal_immutable_delete_v2
BEFORE DELETE ON debt_payment_reversals
BEGIN
  SELECT RAISE(ABORT,'Корректировку платежа нельзя удалить');
END;

-- Net debt payments are used by all database-level bucket spending guards.
CREATE VIEW IF NOT EXISTS debt_payment_bucket_net AS
SELECT p.user_id,p.bucket_id,
       SUM(p.amount)-COALESCE((
         SELECT SUM(r.amount)
         FROM debt_payment_reversals r
         JOIN debt_payments rp ON rp.id=r.debt_payment_id
         WHERE rp.user_id=p.user_id AND rp.bucket_id=p.bucket_id
       ),0) AS amount
FROM debt_payments p
WHERE p.bucket_id IS NOT NULL
GROUP BY p.user_id,p.bucket_id;

DROP TRIGGER IF EXISTS trg_bucket_expense_balance_insert;
DROP TRIGGER IF EXISTS trg_bucket_expense_balance_update;
DROP TRIGGER IF EXISTS trg_bucket_debt_payment_balance_insert;
DROP TRIGGER IF EXISTS trg_bucket_debt_payment_balance_update;
DROP TRIGGER IF EXISTS trg_bucket_obligation_payment_balance_insert;
DROP TRIGGER IF EXISTS trg_bucket_obligation_payment_balance_update;

CREATE TRIGGER trg_bucket_expense_balance_insert
BEFORE INSERT ON expenses
WHEN NEW.bucket_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM income_buckets inactive_bucket WHERE inactive_bucket.id=NEW.bucket_id AND inactive_bucket.user_id=NEW.user_id AND inactive_bucket.active=0)
 AND NOT EXISTS (
 SELECT 1 FROM income_buckets b WHERE b.id=NEW.bucket_id AND b.user_id=NEW.user_id
 AND (
  COALESCE((SELECT SUM(a.amount) FROM income_bucket_allocations a WHERE a.user_id=NEW.user_id AND a.bucket_id=NEW.bucket_id),0)
  -COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.user_id=NEW.user_id AND e.bucket_id=NEW.bucket_id),0)
  -COALESCE((SELECT amount FROM debt_payment_bucket_net n WHERE n.user_id=NEW.user_id AND n.bucket_id=NEW.bucket_id),0)
  -COALESCE((SELECT SUM(p.amount) FROM obligation_payments p WHERE p.user_id=NEW.user_id AND p.bucket_id=NEW.bucket_id),0)
 )+0.0001>=NEW.amount
)
BEGIN SELECT RAISE(ABORT,'Недостаточно средств в корзине'); END;

CREATE TRIGGER trg_bucket_expense_balance_update
BEFORE UPDATE OF amount,bucket_id,user_id ON expenses
WHEN NEW.bucket_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM income_buckets inactive_bucket WHERE inactive_bucket.id=NEW.bucket_id AND inactive_bucket.user_id=NEW.user_id AND inactive_bucket.active=0)
 AND NOT EXISTS (
 SELECT 1 FROM income_buckets b WHERE b.id=NEW.bucket_id AND b.user_id=NEW.user_id
 AND (
  COALESCE((SELECT SUM(a.amount) FROM income_bucket_allocations a WHERE a.user_id=NEW.user_id AND a.bucket_id=NEW.bucket_id),0)
  -COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.user_id=NEW.user_id AND e.bucket_id=NEW.bucket_id AND e.id<>OLD.id),0)
  -COALESCE((SELECT amount FROM debt_payment_bucket_net n WHERE n.user_id=NEW.user_id AND n.bucket_id=NEW.bucket_id),0)
  -COALESCE((SELECT SUM(p.amount) FROM obligation_payments p WHERE p.user_id=NEW.user_id AND p.bucket_id=NEW.bucket_id),0)
 )+0.0001>=NEW.amount
)
BEGIN SELECT RAISE(ABORT,'Недостаточно средств в корзине'); END;

CREATE TRIGGER trg_bucket_debt_payment_balance_insert
BEFORE INSERT ON debt_payments
WHEN NEW.bucket_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM income_buckets inactive_bucket WHERE inactive_bucket.id=NEW.bucket_id AND inactive_bucket.user_id=NEW.user_id AND inactive_bucket.active=0)
 AND NOT EXISTS (
 SELECT 1 FROM income_buckets b WHERE b.id=NEW.bucket_id AND b.user_id=NEW.user_id
 AND (
  COALESCE((SELECT SUM(a.amount) FROM income_bucket_allocations a WHERE a.user_id=NEW.user_id AND a.bucket_id=NEW.bucket_id),0)
  -COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.user_id=NEW.user_id AND e.bucket_id=NEW.bucket_id),0)
  -COALESCE((SELECT amount FROM debt_payment_bucket_net n WHERE n.user_id=NEW.user_id AND n.bucket_id=NEW.bucket_id),0)
  -COALESCE((SELECT SUM(p.amount) FROM obligation_payments p WHERE p.user_id=NEW.user_id AND p.bucket_id=NEW.bucket_id),0)
 )+0.0001>=NEW.amount
)
BEGIN SELECT RAISE(ABORT,'Недостаточно средств в корзине'); END;

CREATE TRIGGER trg_bucket_debt_payment_balance_update
BEFORE UPDATE OF amount,bucket_id,user_id ON debt_payments
WHEN NEW.bucket_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM income_buckets inactive_bucket WHERE inactive_bucket.id=NEW.bucket_id AND inactive_bucket.user_id=NEW.user_id AND inactive_bucket.active=0)
 AND NOT EXISTS (
 SELECT 1 FROM income_buckets b WHERE b.id=NEW.bucket_id AND b.user_id=NEW.user_id
 AND (
  COALESCE((SELECT SUM(a.amount) FROM income_bucket_allocations a WHERE a.user_id=NEW.user_id AND a.bucket_id=NEW.bucket_id),0)
  -COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.user_id=NEW.user_id AND e.bucket_id=NEW.bucket_id),0)
  -COALESCE((SELECT amount FROM debt_payment_bucket_net n WHERE n.user_id=NEW.user_id AND n.bucket_id=NEW.bucket_id),0)
  -COALESCE((SELECT SUM(p.amount) FROM obligation_payments p WHERE p.user_id=NEW.user_id AND p.bucket_id=NEW.bucket_id),0)
 )+0.0001>=NEW.amount
)
BEGIN SELECT RAISE(ABORT,'Недостаточно средств в корзине'); END;

CREATE TRIGGER trg_bucket_obligation_payment_balance_insert
BEFORE INSERT ON obligation_payments
WHEN NEW.bucket_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM income_buckets inactive_bucket WHERE inactive_bucket.id=NEW.bucket_id AND inactive_bucket.user_id=NEW.user_id AND inactive_bucket.active=0)
 AND NOT EXISTS (
 SELECT 1 FROM income_buckets b WHERE b.id=NEW.bucket_id AND b.user_id=NEW.user_id
 AND (
  COALESCE((SELECT SUM(a.amount) FROM income_bucket_allocations a WHERE a.user_id=NEW.user_id AND a.bucket_id=NEW.bucket_id),0)
  -COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.user_id=NEW.user_id AND e.bucket_id=NEW.bucket_id),0)
  -COALESCE((SELECT amount FROM debt_payment_bucket_net n WHERE n.user_id=NEW.user_id AND n.bucket_id=NEW.bucket_id),0)
  -COALESCE((SELECT SUM(p.amount) FROM obligation_payments p WHERE p.user_id=NEW.user_id AND p.bucket_id=NEW.bucket_id),0)
 )+0.0001>=NEW.amount
)
BEGIN SELECT RAISE(ABORT,'Недостаточно средств в корзине'); END;

CREATE TRIGGER trg_bucket_obligation_payment_balance_update
BEFORE UPDATE OF amount,bucket_id,user_id ON obligation_payments
WHEN NEW.bucket_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM income_buckets inactive_bucket WHERE inactive_bucket.id=NEW.bucket_id AND inactive_bucket.user_id=NEW.user_id AND inactive_bucket.active=0)
 AND NOT EXISTS (
 SELECT 1 FROM income_buckets b WHERE b.id=NEW.bucket_id AND b.user_id=NEW.user_id
 AND (
  COALESCE((SELECT SUM(a.amount) FROM income_bucket_allocations a WHERE a.user_id=NEW.user_id AND a.bucket_id=NEW.bucket_id),0)
  -COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.user_id=NEW.user_id AND e.bucket_id=NEW.bucket_id),0)
  -COALESCE((SELECT amount FROM debt_payment_bucket_net n WHERE n.user_id=NEW.user_id AND n.bucket_id=NEW.bucket_id),0)
  -COALESCE((SELECT SUM(p.amount) FROM obligation_payments p WHERE p.user_id=NEW.user_id AND p.bucket_id=NEW.bucket_id AND p.id<>OLD.id),0)
 )+0.0001>=NEW.amount
)
BEGIN SELECT RAISE(ABORT,'Недостаточно средств в корзине'); END;
