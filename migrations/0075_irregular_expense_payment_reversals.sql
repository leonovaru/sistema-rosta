-- Reversible corrections for irregular-expense payment facts.
CREATE TABLE IF NOT EXISTS irregular_expense_payment_reversals (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 irregular_expense_payment_id TEXT NOT NULL UNIQUE REFERENCES irregular_expense_payments(id) ON DELETE RESTRICT,
 expense_id TEXT NOT NULL UNIQUE REFERENCES expenses(id) ON DELETE RESTRICT,
 amount REAL NOT NULL CHECK(amount>0),
 reversed_on TEXT NOT NULL,
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 3 AND 500),
 request_id TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (datetime('now')),
 UNIQUE(user_id,request_id)
);
CREATE INDEX IF NOT EXISTS idx_irregular_payment_reversals_user_date ON irregular_expense_payment_reversals(user_id,reversed_on);

CREATE TABLE IF NOT EXISTS irregular_expense_payment_occurrences (
 irregular_expense_id TEXT NOT NULL REFERENCES irregular_expenses(id) ON DELETE RESTRICT,
 scheduled_due_date TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('paid','unpaid')),
 payment_id TEXT REFERENCES irregular_expense_payments(id) ON DELETE RESTRICT,
 updated_at TEXT NOT NULL DEFAULT (datetime('now')),
 PRIMARY KEY(irregular_expense_id,scheduled_due_date)
);
INSERT INTO irregular_expense_payment_occurrences(irregular_expense_id,scheduled_due_date,status,payment_id)
SELECT p.irregular_expense_id,p.scheduled_due_date,'paid',p.id
FROM irregular_expense_payments p
WHERE p.scheduled_due_date IS NOT NULL
ON CONFLICT(irregular_expense_id,scheduled_due_date) DO UPDATE SET status='paid',payment_id=excluded.payment_id,updated_at=datetime('now');

DROP INDEX IF EXISTS idx_irregular_payment_scheduled_occurrence;
CREATE TRIGGER IF NOT EXISTS trg_irregular_payment_occurrence_before_insert
BEFORE INSERT ON irregular_expense_payments
WHEN NEW.scheduled_due_date IS NOT NULL AND EXISTS(
 SELECT 1 FROM irregular_expense_payment_occurrences o
 WHERE o.irregular_expense_id=NEW.irregular_expense_id
 AND o.scheduled_due_date=NEW.scheduled_due_date AND o.status='paid'
)
BEGIN SELECT RAISE(ABORT,'Период нерегулярного расхода уже оплачен'); END;

CREATE TRIGGER IF NOT EXISTS trg_irregular_payment_occurrence_after_insert
AFTER INSERT ON irregular_expense_payments
WHEN NEW.scheduled_due_date IS NOT NULL
BEGIN
 INSERT INTO irregular_expense_payment_occurrences(irregular_expense_id,scheduled_due_date,status,payment_id)
 VALUES(NEW.irregular_expense_id,NEW.scheduled_due_date,'paid',NEW.id)
 ON CONFLICT(irregular_expense_id,scheduled_due_date) DO UPDATE SET status='paid',payment_id=NEW.id,updated_at=datetime('now');
END;

CREATE TRIGGER IF NOT EXISTS trg_irregular_payment_reversal_before_insert
BEFORE INSERT ON irregular_expense_payment_reversals
WHEN NOT EXISTS(
 SELECT 1 FROM irregular_expense_payments p
 JOIN expenses e ON e.id=p.expense_id AND e.user_id=p.user_id
 WHERE p.id=NEW.irregular_expense_payment_id AND p.user_id=NEW.user_id
 AND p.expense_id=NEW.expense_id AND p.amount=NEW.amount
 AND p.scheduled_due_date IS NOT NULL
)
BEGIN SELECT RAISE(ABORT,'Нельзя отменить оплату без однозначной связи с расходом и периодом'); END;

CREATE TRIGGER IF NOT EXISTS trg_irregular_payment_reversal_after_insert
AFTER INSERT ON irregular_expense_payment_reversals
BEGIN
 UPDATE irregular_expense_payment_occurrences
 SET status='unpaid',payment_id=NULL,updated_at=datetime('now')
 WHERE irregular_expense_id=(SELECT irregular_expense_id FROM irregular_expense_payments WHERE id=NEW.irregular_expense_payment_id)
 AND scheduled_due_date=(SELECT scheduled_due_date FROM irregular_expense_payments WHERE id=NEW.irregular_expense_payment_id)
 AND payment_id=NEW.irregular_expense_payment_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_irregular_payment_reversal_immutable_update
BEFORE UPDATE ON irregular_expense_payment_reversals
BEGIN SELECT RAISE(ABORT,'Журнал отмен оплат нерегулярных расходов неизменяем'); END;
CREATE TRIGGER IF NOT EXISTS trg_irregular_payment_reversal_immutable_delete
BEFORE DELETE ON irregular_expense_payment_reversals
BEGIN SELECT RAISE(ABORT,'Журнал отмен оплат нерегулярных расходов неизменяем'); END;

CREATE VIEW IF NOT EXISTS irregular_expense_payment_bucket_net AS
SELECT e.user_id,e.bucket_id,
 SUM(e.amount-COALESCE((
  SELECT SUM(r.amount) FROM irregular_expense_payment_reversals r
  WHERE r.expense_id=e.id AND r.user_id=e.user_id
 ),0)) AS amount
FROM expenses e
WHERE e.bucket_id IS NOT NULL
GROUP BY e.user_id,e.bucket_id;

-- Bucket guards must count the net amount of linked irregular-expense facts.
DROP TRIGGER IF EXISTS trg_bucket_expense_balance_insert;
CREATE TRIGGER trg_bucket_expense_balance_insert
BEFORE INSERT ON expenses
WHEN NEW.bucket_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM income_buckets b WHERE b.id=NEW.bucket_id AND b.user_id=NEW.user_id
 AND (
  COALESCE((SELECT SUM(a.amount) FROM income_bucket_allocations a WHERE a.user_id=NEW.user_id AND a.bucket_id=NEW.bucket_id),0)
  - COALESCE((SELECT SUM(e.amount-COALESCE((SELECT SUM(r.amount) FROM irregular_expense_payment_reversals r WHERE r.expense_id=e.id AND r.user_id=e.user_id),0)) FROM expenses e WHERE e.user_id=NEW.user_id AND e.bucket_id=NEW.bucket_id),0)
  - COALESCE((SELECT SUM(p.amount) FROM debt_payments p WHERE p.user_id=NEW.user_id AND p.bucket_id=NEW.bucket_id),0)
  - COALESCE((SELECT SUM(p.amount) FROM obligation_payments p WHERE p.user_id=NEW.user_id AND p.bucket_id=NEW.bucket_id),0)
 )+0.0001>=NEW.amount
)
BEGIN SELECT RAISE(ABORT,'Недостаточно средств в корзине'); END;

DROP TRIGGER IF EXISTS trg_bucket_expense_balance_update;
CREATE TRIGGER trg_bucket_expense_balance_update
BEFORE UPDATE OF amount,bucket_id,user_id ON expenses
WHEN NEW.bucket_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM income_buckets b WHERE b.id=NEW.bucket_id AND b.user_id=NEW.user_id
 AND (
  COALESCE((SELECT SUM(a.amount) FROM income_bucket_allocations a WHERE a.user_id=NEW.user_id AND a.bucket_id=NEW.bucket_id),0)
  - COALESCE((SELECT SUM(e.amount-COALESCE((SELECT SUM(r.amount) FROM irregular_expense_payment_reversals r WHERE r.expense_id=e.id AND r.user_id=e.user_id),0)) FROM expenses e WHERE e.user_id=NEW.user_id AND e.bucket_id=NEW.bucket_id AND e.id<>OLD.id),0)
  - COALESCE((SELECT SUM(p.amount) FROM debt_payments p WHERE p.user_id=NEW.user_id AND p.bucket_id=NEW.bucket_id),0)
  - COALESCE((SELECT SUM(p.amount) FROM obligation_payments p WHERE p.user_id=NEW.user_id AND p.bucket_id=NEW.bucket_id),0)
 )+0.0001>=NEW.amount
)
BEGIN SELECT RAISE(ABORT,'Недостаточно средств в корзине'); END;

DROP TRIGGER IF EXISTS trg_bucket_debt_payment_balance_insert;
CREATE TRIGGER trg_bucket_debt_payment_balance_insert
BEFORE INSERT ON debt_payments
WHEN NEW.bucket_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM income_buckets b WHERE b.id=NEW.bucket_id AND b.user_id=NEW.user_id
 AND (
  COALESCE((SELECT SUM(a.amount) FROM income_bucket_allocations a WHERE a.user_id=NEW.user_id AND a.bucket_id=NEW.bucket_id),0)
  - COALESCE((SELECT SUM(e.amount-COALESCE((SELECT SUM(r.amount) FROM irregular_expense_payment_reversals r WHERE r.expense_id=e.id AND r.user_id=e.user_id),0)) FROM expenses e WHERE e.user_id=NEW.user_id AND e.bucket_id=NEW.bucket_id),0)
  - COALESCE((SELECT SUM(p.amount) FROM debt_payments p WHERE p.user_id=NEW.user_id AND p.bucket_id=NEW.bucket_id),0)
  - COALESCE((SELECT SUM(p.amount) FROM obligation_payments p WHERE p.user_id=NEW.user_id AND p.bucket_id=NEW.bucket_id),0)
 )+0.0001>=NEW.amount
)
BEGIN SELECT RAISE(ABORT,'Недостаточно средств в корзине'); END;

DROP TRIGGER IF EXISTS trg_bucket_debt_payment_balance_update;
CREATE TRIGGER trg_bucket_debt_payment_balance_update
BEFORE UPDATE OF amount,bucket_id,user_id ON debt_payments
WHEN NEW.bucket_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM income_buckets b WHERE b.id=NEW.bucket_id AND b.user_id=NEW.user_id
 AND (
  COALESCE((SELECT SUM(a.amount) FROM income_bucket_allocations a WHERE a.user_id=NEW.user_id AND a.bucket_id=NEW.bucket_id),0)
  - COALESCE((SELECT SUM(e.amount-COALESCE((SELECT SUM(r.amount) FROM irregular_expense_payment_reversals r WHERE r.expense_id=e.id AND r.user_id=e.user_id),0)) FROM expenses e WHERE e.user_id=NEW.user_id AND e.bucket_id=NEW.bucket_id),0)
  - COALESCE((SELECT SUM(p.amount) FROM debt_payments p WHERE p.user_id=NEW.user_id AND p.bucket_id=NEW.bucket_id AND p.id<>OLD.id),0)
  - COALESCE((SELECT SUM(p.amount) FROM obligation_payments p WHERE p.user_id=NEW.user_id AND p.bucket_id=NEW.bucket_id),0)
 )+0.0001>=NEW.amount
)
BEGIN SELECT RAISE(ABORT,'Недостаточно средств в корзине'); END;

DROP TRIGGER IF EXISTS trg_bucket_obligation_payment_balance_insert;
CREATE TRIGGER trg_bucket_obligation_payment_balance_insert
BEFORE INSERT ON obligation_payments
WHEN NEW.bucket_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM income_buckets b WHERE b.id=NEW.bucket_id AND b.user_id=NEW.user_id
 AND (
  COALESCE((SELECT SUM(a.amount) FROM income_bucket_allocations a WHERE a.user_id=NEW.user_id AND a.bucket_id=NEW.bucket_id),0)
  - COALESCE((SELECT SUM(e.amount-COALESCE((SELECT SUM(r.amount) FROM irregular_expense_payment_reversals r WHERE r.expense_id=e.id AND r.user_id=e.user_id),0)) FROM expenses e WHERE e.user_id=NEW.user_id AND e.bucket_id=NEW.bucket_id),0)
  - COALESCE((SELECT SUM(p.amount) FROM debt_payments p WHERE p.user_id=NEW.user_id AND p.bucket_id=NEW.bucket_id),0)
  - COALESCE((SELECT SUM(p.amount) FROM obligation_payments p WHERE p.user_id=NEW.user_id AND p.bucket_id=NEW.bucket_id),0)
 )+0.0001>=NEW.amount
)
BEGIN SELECT RAISE(ABORT,'Недостаточно средств в корзине'); END;

DROP TRIGGER IF EXISTS trg_bucket_obligation_payment_balance_update;
CREATE TRIGGER trg_bucket_obligation_payment_balance_update
BEFORE UPDATE OF amount,bucket_id,user_id ON obligation_payments
WHEN NEW.bucket_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM income_buckets b WHERE b.id=NEW.bucket_id AND b.user_id=NEW.user_id
 AND (
  COALESCE((SELECT SUM(a.amount) FROM income_bucket_allocations a WHERE a.user_id=NEW.user_id AND a.bucket_id=NEW.bucket_id),0)
  - COALESCE((SELECT SUM(e.amount-COALESCE((SELECT SUM(r.amount) FROM irregular_expense_payment_reversals r WHERE r.expense_id=e.id AND r.user_id=e.user_id),0)) FROM expenses e WHERE e.user_id=NEW.user_id AND e.bucket_id=NEW.bucket_id),0)
  - COALESCE((SELECT SUM(p.amount) FROM debt_payments p WHERE p.user_id=NEW.user_id AND p.bucket_id=NEW.bucket_id),0)
  - COALESCE((SELECT SUM(p.amount) FROM obligation_payments p WHERE p.user_id=NEW.user_id AND p.bucket_id=NEW.bucket_id AND p.id<>OLD.id),0)
 )+0.0001>=NEW.amount
)
BEGIN SELECT RAISE(ABORT,'Недостаточно средств в корзине'); END;

-- Allocation edits/deletions also use net expense amounts after a correction.
DROP TRIGGER IF EXISTS trg_bucket_allocation_balance_update;
CREATE TRIGGER trg_bucket_allocation_balance_update
BEFORE UPDATE OF user_id,income_id,bucket_id,amount ON income_bucket_allocations
WHEN
 NOT EXISTS(SELECT 1 FROM income_entries i JOIN income_buckets b ON b.id=NEW.bucket_id AND b.user_id=NEW.user_id WHERE i.id=NEW.income_id AND i.user_id=NEW.user_id)
 OR NEW.amount>COALESCE((SELECT i.amount FROM income_entries i WHERE i.id=NEW.income_id AND i.user_id=NEW.user_id),0)-COALESCE((SELECT SUM(a.amount) FROM income_bucket_allocations a WHERE a.income_id=NEW.income_id AND a.id<>OLD.id),0)+0.0001
 OR ((OLD.bucket_id<>NEW.bucket_id OR OLD.user_id<>NEW.user_id) AND (
  COALESCE((SELECT SUM(a.amount) FROM income_bucket_allocations a WHERE a.user_id=OLD.user_id AND a.bucket_id=OLD.bucket_id AND a.id<>OLD.id),0)
  - COALESCE((SELECT SUM(e.amount-COALESCE((SELECT SUM(r.amount) FROM irregular_expense_payment_reversals r WHERE r.expense_id=e.id AND r.user_id=e.user_id),0)) FROM expenses e WHERE e.user_id=OLD.user_id AND e.bucket_id=OLD.bucket_id),0)
  - COALESCE((SELECT SUM(p.amount) FROM debt_payments p WHERE p.user_id=OLD.user_id AND p.bucket_id=OLD.bucket_id),0)
  - COALESCE((SELECT SUM(p.amount) FROM obligation_payments p WHERE p.user_id=OLD.user_id AND p.bucket_id=OLD.bucket_id),0)
 )+0.0001<0)
 OR ((OLD.bucket_id=NEW.bucket_id AND OLD.user_id=NEW.user_id) AND (
  COALESCE((SELECT SUM(a.amount) FROM income_bucket_allocations a WHERE a.user_id=NEW.user_id AND a.bucket_id=NEW.bucket_id AND a.id<>OLD.id),0)+NEW.amount
  - COALESCE((SELECT SUM(e.amount-COALESCE((SELECT SUM(r.amount) FROM irregular_expense_payment_reversals r WHERE r.expense_id=e.id AND r.user_id=e.user_id),0)) FROM expenses e WHERE e.user_id=NEW.user_id AND e.bucket_id=NEW.bucket_id),0)
  - COALESCE((SELECT SUM(p.amount) FROM debt_payments p WHERE p.user_id=NEW.user_id AND p.bucket_id=NEW.bucket_id),0)
  - COALESCE((SELECT SUM(p.amount) FROM obligation_payments p WHERE p.user_id=NEW.user_id AND p.bucket_id=NEW.bucket_id),0)
 )+0.0001<0)
 OR ((OLD.bucket_id<>NEW.bucket_id OR OLD.user_id<>NEW.user_id) AND (
  COALESCE((SELECT SUM(a.amount) FROM income_bucket_allocations a WHERE a.user_id=NEW.user_id AND a.bucket_id=NEW.bucket_id),0)+NEW.amount
  - COALESCE((SELECT SUM(e.amount-COALESCE((SELECT SUM(r.amount) FROM irregular_expense_payment_reversals r WHERE r.expense_id=e.id AND r.user_id=e.user_id),0)) FROM expenses e WHERE e.user_id=NEW.user_id AND e.bucket_id=NEW.bucket_id),0)
  - COALESCE((SELECT SUM(p.amount) FROM debt_payments p WHERE p.user_id=NEW.user_id AND p.bucket_id=NEW.bucket_id),0)
  - COALESCE((SELECT SUM(p.amount) FROM obligation_payments p WHERE p.user_id=NEW.user_id AND p.bucket_id=NEW.bucket_id),0)
 )+0.0001<0)
BEGIN SELECT RAISE(ABORT,'Нельзя изменить распределение: в корзине уже использованы эти деньги'); END;

DROP TRIGGER IF EXISTS trg_bucket_allocation_balance_delete;
CREATE TRIGGER trg_bucket_allocation_balance_delete
BEFORE DELETE ON income_bucket_allocations
WHEN (
 COALESCE((SELECT SUM(a.amount) FROM income_bucket_allocations a WHERE a.user_id=OLD.user_id AND a.bucket_id=OLD.bucket_id AND a.id<>OLD.id),0)
 - COALESCE((SELECT SUM(e.amount-COALESCE((SELECT SUM(r.amount) FROM irregular_expense_payment_reversals r WHERE r.expense_id=e.id AND r.user_id=e.user_id),0)) FROM expenses e WHERE e.user_id=OLD.user_id AND e.bucket_id=OLD.bucket_id),0)
 - COALESCE((SELECT SUM(p.amount) FROM debt_payments p WHERE p.user_id=OLD.user_id AND p.bucket_id=OLD.bucket_id),0)
 - COALESCE((SELECT SUM(p.amount) FROM obligation_payments p WHERE p.user_id=OLD.user_id AND p.bucket_id=OLD.bucket_id),0)
)+0.0001<0
BEGIN SELECT RAISE(ABORT,'Нельзя удалить распределение: в корзине уже использованы эти деньги'); END;
