-- Immutable reversal events plus mutable per-period state for safe re-payment.
CREATE TABLE IF NOT EXISTS obligation_payment_occurrences (
 obligation_id TEXT NOT NULL REFERENCES payment_obligations(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 scheduled_due_date TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('paid','unpaid')),
 payment_id TEXT REFERENCES obligation_payments(id) ON DELETE RESTRICT,
 updated_at TEXT NOT NULL DEFAULT (datetime('now')),
 PRIMARY KEY(obligation_id,scheduled_due_date)
);
INSERT OR IGNORE INTO obligation_payment_occurrences(obligation_id,user_id,scheduled_due_date,status,payment_id)
SELECT p.obligation_id,p.user_id,p.scheduled_due_date,'paid',
 (SELECT p2.id FROM obligation_payments p2 WHERE p2.obligation_id=p.obligation_id AND p2.user_id=p.user_id AND p2.scheduled_due_date=p.scheduled_due_date ORDER BY p2.created_at DESC,p2.id DESC LIMIT 1)
FROM obligation_payments p WHERE p.scheduled_due_date IS NOT NULL
GROUP BY p.obligation_id,p.user_id,p.scheduled_due_date;
DROP INDEX IF EXISTS idx_obligation_payments_occurrence;
CREATE INDEX IF NOT EXISTS idx_obligation_occurrences_user_status ON obligation_payment_occurrences(user_id,status,scheduled_due_date);

CREATE TABLE IF NOT EXISTS obligation_payment_reversals (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 obligation_payment_id TEXT NOT NULL UNIQUE REFERENCES obligation_payments(id) ON DELETE RESTRICT,
 amount REAL NOT NULL CHECK(amount>0),
 reversed_on TEXT NOT NULL,
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 3 AND 500),
 request_id TEXT,
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_obligation_payment_reversals_user_date ON obligation_payment_reversals(user_id,reversed_on);
CREATE UNIQUE INDEX IF NOT EXISTS idx_obligation_payment_reversals_request ON obligation_payment_reversals(user_id,request_id) WHERE request_id IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS trg_obligation_occurrence_before_payment
BEFORE INSERT ON obligation_payments
WHEN NEW.scheduled_due_date IS NOT NULL AND EXISTS(
 SELECT 1 FROM obligation_payment_occurrences o WHERE o.obligation_id=NEW.obligation_id AND o.user_id=NEW.user_id AND o.scheduled_due_date=NEW.scheduled_due_date AND o.status='paid'
)
BEGIN SELECT RAISE(ABORT,'Период обязательства уже оплачен'); END;
CREATE TRIGGER IF NOT EXISTS trg_obligation_occurrence_after_payment
AFTER INSERT ON obligation_payments
WHEN NEW.scheduled_due_date IS NOT NULL
BEGIN
 INSERT INTO obligation_payment_occurrences(obligation_id,user_id,scheduled_due_date,status,payment_id,updated_at)
 VALUES(NEW.obligation_id,NEW.user_id,NEW.scheduled_due_date,'paid',NEW.id,datetime('now'))
 ON CONFLICT(obligation_id,scheduled_due_date) DO UPDATE SET status='paid',payment_id=NEW.id,updated_at=datetime('now');
END;

CREATE TRIGGER IF NOT EXISTS trg_obligation_payment_reversal_before_insert
BEFORE INSERT ON obligation_payment_reversals
WHEN NOT EXISTS(
 SELECT 1 FROM obligation_payments p
 WHERE p.id=NEW.obligation_payment_id AND p.user_id=NEW.user_id AND ABS(p.amount-NEW.amount)<0.0001
 AND p.scheduled_due_date IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM obligation_payment_reversals r WHERE r.obligation_payment_id=p.id)
)
BEGIN SELECT RAISE(ABORT,'Исходный платёж не найден, уже отменён или сумма не совпадает'); END;
DROP TRIGGER IF EXISTS trg_obligation_payment_reversal_after_insert;
CREATE TRIGGER trg_obligation_payment_reversal_after_insert
AFTER INSERT ON obligation_payment_reversals
BEGIN
 UPDATE obligation_payment_occurrences SET status='unpaid',payment_id=NULL,updated_at=datetime('now')
 WHERE user_id=NEW.user_id AND payment_id=NEW.obligation_payment_id;
 -- One-time schedule cursor is restored atomically by the authenticated API operation.
END;
CREATE TRIGGER IF NOT EXISTS trg_obligation_payment_reversal_immutable_update
BEFORE UPDATE ON obligation_payment_reversals
BEGIN SELECT RAISE(ABORT,'Корректировку платежа нельзя изменить'); END;
CREATE TRIGGER IF NOT EXISTS trg_obligation_payment_reversal_immutable_delete
BEFORE DELETE ON obligation_payment_reversals
BEGIN SELECT RAISE(ABORT,'Корректировку платежа нельзя удалить'); END;

CREATE VIEW IF NOT EXISTS obligation_payment_bucket_net AS
SELECT p.user_id,p.bucket_id,SUM(p.amount)-COALESCE((
 SELECT SUM(r.amount) FROM obligation_payment_reversals r JOIN obligation_payments rp ON rp.id=r.obligation_payment_id
 WHERE rp.user_id=p.user_id AND rp.bucket_id=p.bucket_id
),0) AS amount
FROM obligation_payments p WHERE p.bucket_id IS NOT NULL GROUP BY p.user_id,p.bucket_id;

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
  -COALESCE((SELECT amount FROM obligation_payment_bucket_net n WHERE n.user_id=NEW.user_id AND n.bucket_id=NEW.bucket_id),0)
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
  -COALESCE((SELECT amount FROM obligation_payment_bucket_net n WHERE n.user_id=NEW.user_id AND n.bucket_id=NEW.bucket_id),0)
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
  -COALESCE((SELECT amount FROM obligation_payment_bucket_net n WHERE n.user_id=NEW.user_id AND n.bucket_id=NEW.bucket_id),0)
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
  -COALESCE((SELECT amount FROM obligation_payment_bucket_net n WHERE n.user_id=NEW.user_id AND n.bucket_id=NEW.bucket_id),0)
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
  -COALESCE((SELECT amount FROM obligation_payment_bucket_net n WHERE n.user_id=NEW.user_id AND n.bucket_id=NEW.bucket_id),0)
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
  -COALESCE((SELECT amount FROM obligation_payment_bucket_net n WHERE n.user_id=NEW.user_id AND n.bucket_id=NEW.bucket_id),0)
 )+0.0001>=NEW.amount
)
BEGIN SELECT RAISE(ABORT,'Недостаточно средств в корзине'); END;

