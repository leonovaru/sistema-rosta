-- Archived buckets remain readable as historical references but cannot receive
-- new allocations. Existing spending and payment history remains untouched.
CREATE TRIGGER IF NOT EXISTS trg_bucket_allocation_active_insert
BEFORE INSERT ON income_bucket_allocations
WHEN NOT EXISTS (
 SELECT 1 FROM income_buckets b
 WHERE b.id=NEW.bucket_id AND b.user_id=NEW.user_id AND b.active=1
)
BEGIN
 SELECT RAISE(ABORT,'Нельзя распределять деньги в архивную корзину');
END;

CREATE TRIGGER IF NOT EXISTS trg_bucket_allocation_active_update
BEFORE UPDATE OF bucket_id,user_id ON income_bucket_allocations
WHEN NOT EXISTS (
 SELECT 1 FROM income_buckets b
 WHERE b.id=NEW.bucket_id AND b.user_id=NEW.user_id AND b.active=1
)
BEGIN
 SELECT RAISE(ABORT,'Нельзя переносить распределение в архивную корзину');
END;
