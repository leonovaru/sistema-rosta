-- Keep transfers protected when later edits reduce the source bucket balance.
CREATE TRIGGER IF NOT EXISTS trg_funding_transfer_expense_update
BEFORE UPDATE OF amount,bucket_id,user_id ON expenses
WHEN NEW.bucket_id IS NOT NULL
AND COALESCE((SELECT amount FROM bucket_funding_transfer_net WHERE user_id=NEW.user_id AND source_bucket_id=NEW.bucket_id),0)>0
AND COALESCE((SELECT amount FROM bucket_funding_transfer_net WHERE user_id=NEW.user_id AND source_bucket_id=NEW.bucket_id),0)>
 COALESCE((SELECT SUM(a.amount) FROM income_bucket_allocations a WHERE a.user_id=NEW.user_id AND a.bucket_id=NEW.bucket_id),0)
 -COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.user_id=NEW.user_id AND e.bucket_id=NEW.bucket_id AND e.id<>OLD.id),0)
 +COALESCE((SELECT SUM(r.amount) FROM irregular_expense_payment_reversals r JOIN expenses e ON e.id=r.expense_id WHERE r.user_id=NEW.user_id AND e.bucket_id=NEW.bucket_id AND e.id<>OLD.id),0)
 -COALESCE((SELECT amount FROM debt_payment_bucket_net WHERE user_id=NEW.user_id AND bucket_id=NEW.bucket_id),0)
 -COALESCE((SELECT amount FROM obligation_payment_bucket_net WHERE user_id=NEW.user_id AND bucket_id=NEW.bucket_id),0)
 -NEW.amount+0.0001
BEGIN SELECT RAISE(ABORT,'Средства уже переведены из корзины: нельзя увеличить расход'); END;

CREATE TRIGGER IF NOT EXISTS trg_funding_transfer_allocation_update
BEFORE UPDATE OF user_id,income_id,bucket_id,amount ON income_bucket_allocations
WHEN
 (COALESCE((SELECT amount FROM bucket_funding_transfer_net WHERE user_id=OLD.user_id AND source_bucket_id=OLD.bucket_id),0)>0
 AND COALESCE((SELECT amount FROM bucket_funding_transfer_net WHERE user_id=OLD.user_id AND source_bucket_id=OLD.bucket_id),0)>
  COALESCE((SELECT SUM(a.amount) FROM income_bucket_allocations a WHERE a.user_id=OLD.user_id AND a.bucket_id=OLD.bucket_id AND a.id<>OLD.id),0)
  -COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.user_id=OLD.user_id AND e.bucket_id=OLD.bucket_id),0)
  +COALESCE((SELECT SUM(r.amount) FROM irregular_expense_payment_reversals r JOIN expenses e ON e.id=r.expense_id WHERE r.user_id=OLD.user_id AND e.bucket_id=OLD.bucket_id),0)
  -COALESCE((SELECT amount FROM debt_payment_bucket_net WHERE user_id=OLD.user_id AND bucket_id=OLD.bucket_id),0)
  -COALESCE((SELECT amount FROM obligation_payment_bucket_net WHERE user_id=OLD.user_id AND bucket_id=OLD.bucket_id),0)+0.0001)
 OR
 (COALESCE((SELECT amount FROM bucket_funding_transfer_net WHERE user_id=NEW.user_id AND source_bucket_id=NEW.bucket_id),0)>0
 AND COALESCE((SELECT amount FROM bucket_funding_transfer_net WHERE user_id=NEW.user_id AND source_bucket_id=NEW.bucket_id),0)>
  COALESCE((SELECT SUM(a.amount) FROM income_bucket_allocations a WHERE a.user_id=NEW.user_id AND a.bucket_id=NEW.bucket_id AND a.id<>OLD.id),0)+NEW.amount
  -COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.user_id=NEW.user_id AND e.bucket_id=NEW.bucket_id),0)
  +COALESCE((SELECT SUM(r.amount) FROM irregular_expense_payment_reversals r JOIN expenses e ON e.id=r.expense_id WHERE r.user_id=NEW.user_id AND e.bucket_id=NEW.bucket_id),0)
  -COALESCE((SELECT amount FROM debt_payment_bucket_net WHERE user_id=NEW.user_id AND bucket_id=NEW.bucket_id),0)
  -COALESCE((SELECT amount FROM obligation_payment_bucket_net WHERE user_id=NEW.user_id AND bucket_id=NEW.bucket_id),0)+0.0001)
BEGIN SELECT RAISE(ABORT,'Средства уже переведены из корзины: нельзя уменьшить распределение'); END;

CREATE TRIGGER IF NOT EXISTS trg_funding_transfer_allocation_delete
BEFORE DELETE ON income_bucket_allocations
WHEN COALESCE((SELECT amount FROM bucket_funding_transfer_net WHERE user_id=OLD.user_id AND source_bucket_id=OLD.bucket_id),0)>0
AND COALESCE((SELECT amount FROM bucket_funding_transfer_net WHERE user_id=OLD.user_id AND source_bucket_id=OLD.bucket_id),0)>
 COALESCE((SELECT SUM(a.amount) FROM income_bucket_allocations a WHERE a.user_id=OLD.user_id AND a.bucket_id=OLD.bucket_id AND a.id<>OLD.id),0)
 -COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.user_id=OLD.user_id AND e.bucket_id=OLD.bucket_id),0)
 +COALESCE((SELECT SUM(r.amount) FROM irregular_expense_payment_reversals r JOIN expenses e ON e.id=r.expense_id WHERE r.user_id=OLD.user_id AND e.bucket_id=OLD.bucket_id),0)
 -COALESCE((SELECT amount FROM debt_payment_bucket_net WHERE user_id=OLD.user_id AND bucket_id=OLD.bucket_id),0)
 -COALESCE((SELECT amount FROM obligation_payment_bucket_net WHERE user_id=OLD.user_id AND bucket_id=OLD.bucket_id),0)+0.0001
BEGIN SELECT RAISE(ABORT,'Средства уже переведены из корзины: нельзя удалить распределение'); END;

CREATE TRIGGER IF NOT EXISTS trg_funding_transfer_goal_delete
BEFORE DELETE ON financial_goals
WHEN EXISTS(SELECT 1 FROM bucket_funding_transfers WHERE user_id=OLD.user_id AND target_type='goal' AND target_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'У цели есть история переводов. Архивируй её, чтобы сохранить финансовую историю'); END;
