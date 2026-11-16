-- Keep at least one active bucket even when concurrent archive requests
-- bypass the API's preflight count.
CREATE TRIGGER IF NOT EXISTS trg_keep_one_active_income_bucket
BEFORE UPDATE OF active ON income_buckets
WHEN OLD.active=1 AND NEW.active=0
 AND (SELECT COUNT(*) FROM income_buckets WHERE user_id=OLD.user_id AND active=1)<=1
BEGIN
 SELECT RAISE(ABORT,'Нельзя архивировать последнюю активную корзину');
END;
