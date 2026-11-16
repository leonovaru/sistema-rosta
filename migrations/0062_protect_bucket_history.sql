-- A bucket with linked allocations or spending is a historical reference.
-- Archive it instead of cascading away allocation rows or detaching payments.
CREATE TRIGGER IF NOT EXISTS trg_income_bucket_history_delete
BEFORE DELETE ON income_buckets
WHEN EXISTS(SELECT 1 FROM income_bucket_allocations WHERE bucket_id=OLD.id AND user_id=OLD.user_id)
 OR EXISTS(SELECT 1 FROM expenses WHERE bucket_id=OLD.id AND user_id=OLD.user_id)
 OR EXISTS(SELECT 1 FROM debt_payments WHERE bucket_id=OLD.id AND user_id=OLD.user_id)
 OR EXISTS(SELECT 1 FROM obligation_payments WHERE bucket_id=OLD.id AND user_id=OLD.user_id)
BEGIN
 SELECT RAISE(ABORT,'Нельзя удалить распределение и финансовую историю корзины: архивируй её');
END;
