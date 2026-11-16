-- An archived bucket is historical-only: no new spending/payment facts
-- may be assigned to it, even by stale clients or direct API requests.
CREATE TRIGGER IF NOT EXISTS trg_archived_bucket_expense_insert
BEFORE INSERT ON expenses
WHEN NEW.bucket_id IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM income_buckets b WHERE b.id=NEW.bucket_id AND b.user_id=NEW.user_id AND b.active=1)
BEGIN
 SELECT RAISE(ABORT,'Нельзя записать новый расход в архивную корзину');
END;

CREATE TRIGGER IF NOT EXISTS trg_archived_bucket_expense_update
BEFORE UPDATE OF amount,bucket_id,user_id ON expenses
WHEN NEW.bucket_id IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM income_buckets b WHERE b.id=NEW.bucket_id AND b.user_id=NEW.user_id AND b.active=1)
 AND (NEW.bucket_id IS NOT OLD.bucket_id OR NEW.amount>OLD.amount)
BEGIN
 SELECT RAISE(ABORT,'Нельзя увеличить расход или перенести его в архивную корзину');
END;

CREATE TRIGGER IF NOT EXISTS trg_archived_bucket_debt_payment_insert
BEFORE INSERT ON debt_payments
WHEN NEW.bucket_id IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM income_buckets b WHERE b.id=NEW.bucket_id AND b.user_id=NEW.user_id AND b.active=1)
BEGIN
 SELECT RAISE(ABORT,'Нельзя записать платёж в архивную корзину');
END;

CREATE TRIGGER IF NOT EXISTS trg_archived_bucket_debt_payment_update
BEFORE UPDATE OF amount,bucket_id,user_id ON debt_payments
WHEN NEW.bucket_id IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM income_buckets b WHERE b.id=NEW.bucket_id AND b.user_id=NEW.user_id AND b.active=1)
BEGIN
 SELECT RAISE(ABORT,'Нельзя изменить платёж в архивной корзине');
END;

CREATE TRIGGER IF NOT EXISTS trg_archived_bucket_obligation_payment_insert
BEFORE INSERT ON obligation_payments
WHEN NEW.bucket_id IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM income_buckets b WHERE b.id=NEW.bucket_id AND b.user_id=NEW.user_id AND b.active=1)
BEGIN
 SELECT RAISE(ABORT,'Нельзя записать обязательный платёж в архивную корзину');
END;

CREATE TRIGGER IF NOT EXISTS trg_archived_bucket_obligation_payment_update
BEFORE UPDATE OF amount,bucket_id,user_id ON obligation_payments
WHEN NEW.bucket_id IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM income_buckets b WHERE b.id=NEW.bucket_id AND b.user_id=NEW.user_id AND b.active=1)
BEGIN
 SELECT RAISE(ABORT,'Нельзя изменить обязательный платёж в архивной корзине');
END;
