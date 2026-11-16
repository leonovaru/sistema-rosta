-- Read-only finance ledger audit. Every statement below is SELECT-only.
-- Run against a recent D1 snapshot first; this file never repairs or mutates data.

-- AUDIT: irregular payments without an expense link
SELECT p.user_id,p.id AS payment_id,p.irregular_expense_id,p.amount,p.paid_on,
 (SELECT COUNT(*) FROM expenses e
  WHERE e.user_id=p.user_id AND e.amount=p.amount AND e.spent_on=p.paid_on
   AND e.note='Оплата нерегулярного расхода') AS matching_expense_count,
 (SELECT COUNT(*) FROM irregular_expense_payments p2
  WHERE p2.user_id=p.user_id AND p2.amount=p.amount AND p2.paid_on=p.paid_on) AS matching_payment_count,
 CASE
  WHEN NOT EXISTS(SELECT 1 FROM expenses e WHERE e.user_id=p.user_id AND e.amount=p.amount AND e.spent_on=p.paid_on AND e.note='Оплата нерегулярного расхода') THEN 'no_matching_expense'
  WHEN (SELECT COUNT(*) FROM expenses e WHERE e.user_id=p.user_id AND e.amount=p.amount AND e.spent_on=p.paid_on AND e.note='Оплата нерегулярного расхода')=1
   AND (SELECT COUNT(*) FROM irregular_expense_payments p2 WHERE p2.user_id=p.user_id AND p2.amount=p.amount AND p2.paid_on=p.paid_on)=1 THEN 'unexpected_unlinked_unique_pair'
  ELSE 'ambiguous_match'
 END AS audit_class
FROM irregular_expense_payments p
WHERE p.expense_id IS NULL
ORDER BY p.user_id,p.paid_on,p.id;

-- AUDIT: generated expense rows with no linked or plausible legacy payment
SELECT e.user_id,e.id AS expense_id,e.title,e.amount,e.spent_on
FROM expenses e
WHERE e.note='Оплата нерегулярного расхода'
 AND NOT EXISTS(SELECT 1 FROM irregular_expense_payments p WHERE p.expense_id=e.id AND p.user_id=e.user_id)
 AND NOT EXISTS(SELECT 1 FROM irregular_expense_payments p
  WHERE p.user_id=e.user_id AND p.amount=e.amount AND p.paid_on=e.spent_on AND p.expense_id IS NULL)
ORDER BY e.user_id,e.spent_on,e.id;

-- AUDIT: linked payment/expense pairs that disagree
SELECT p.user_id,p.id AS payment_id,p.expense_id,e.amount AS expense_amount,e.spent_on AS expense_date,
 p.amount AS payment_amount,p.paid_on AS payment_date,e.note
FROM irregular_expense_payments p
LEFT JOIN expenses e ON e.id=p.expense_id AND e.user_id=p.user_id
WHERE p.expense_id IS NOT NULL
 AND (e.id IS NULL OR e.amount<>p.amount OR e.spent_on<>p.paid_on OR e.note<>'Оплата нерегулярного расхода')
ORDER BY p.user_id,p.paid_on,p.id;

-- AUDIT: debt balances versus immutable payment history (diagnostic, not an auto-repair rule)
SELECT d.user_id,d.id AS debt_id,d.title,d.initial_amount,d.balance,
 COALESCE(SUM(p.amount),0)-COALESCE((SELECT SUM(r.amount) FROM debt_payment_reversals r WHERE r.user_id=d.user_id AND r.debt_payment_id IN (SELECT p2.id FROM debt_payments p2 WHERE p2.debt_id=d.id AND p2.user_id=d.user_id)),0) AS recorded_payments,
 ROUND(d.initial_amount-COALESCE(SUM(p.amount),0)+COALESCE((SELECT SUM(r.amount) FROM debt_payment_reversals r WHERE r.user_id=d.user_id AND r.debt_payment_id IN (SELECT p2.id FROM debt_payments p2 WHERE p2.debt_id=d.id AND p2.user_id=d.user_id)),0),2) AS implied_balance,
 ROUND(d.balance-(d.initial_amount-COALESCE(SUM(p.amount),0)+COALESCE((SELECT SUM(r.amount) FROM debt_payment_reversals r WHERE r.user_id=d.user_id AND r.debt_payment_id IN (SELECT p2.id FROM debt_payments p2 WHERE p2.debt_id=d.id AND p2.user_id=d.user_id)),0)),2) AS difference
FROM debts d
LEFT JOIN debt_payments p ON p.debt_id=d.id AND p.user_id=d.user_id
GROUP BY d.user_id,d.id,d.title,d.initial_amount,d.balance
HAVING ABS(d.balance-(d.initial_amount-COALESCE(SUM(p.amount),0)+COALESCE((SELECT SUM(r.amount) FROM debt_payment_reversals r JOIN debt_payments rp ON rp.id=r.debt_payment_id WHERE rp.debt_id=d.id AND rp.user_id=d.user_id),0)))>0.01
ORDER BY d.user_id,d.title;

-- AUDIT: obligation payment history totals (schedule amount is not a ledger balance)
SELECT o.user_id,o.id AS obligation_id,o.title,o.amount AS scheduled_amount,
 COUNT(p.id) AS payment_count,COALESCE(SUM(p.amount),0) AS recorded_paid,
 COALESCE((SELECT SUM(r.amount) FROM obligation_payment_reversals r JOIN obligation_payments rp ON rp.id=r.obligation_payment_id WHERE rp.obligation_id=o.id AND rp.user_id=o.user_id),0) AS reversed_paid,
 COALESCE(SUM(p.amount),0)-COALESCE((SELECT SUM(r.amount) FROM obligation_payment_reversals r JOIN obligation_payments rp ON rp.id=r.obligation_payment_id WHERE rp.obligation_id=o.id AND rp.user_id=o.user_id),0) AS net_paid,
 MIN(p.paid_on) AS first_paid_on,MAX(p.paid_on) AS last_paid_on
FROM payment_obligations o
LEFT JOIN obligation_payments p ON p.obligation_id=o.id AND p.user_id=o.user_id
GROUP BY o.user_id,o.id,o.title,o.amount
HAVING COUNT(p.id)>0
ORDER BY o.user_id,o.title;

-- AUDIT: bucket available balance using the same net-ledger formula as the app
SELECT b.user_id,b.id AS bucket_id,b.title,
 COALESCE((SELECT SUM(a.amount) FROM income_bucket_allocations a WHERE a.user_id=b.user_id AND a.bucket_id=b.id),0) AS allocated,
 COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.user_id=b.user_id AND e.bucket_id=b.id),0) AS expenses_spent_gross,
 COALESCE((SELECT SUM(r.amount) FROM irregular_expense_payment_reversals r JOIN expenses e ON e.id=r.expense_id WHERE e.user_id=b.user_id AND e.bucket_id=b.id),0) AS irregular_expenses_reversed,
 COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.user_id=b.user_id AND e.bucket_id=b.id),0)-COALESCE((SELECT SUM(r.amount) FROM irregular_expense_payment_reversals r JOIN expenses e ON e.id=r.expense_id WHERE e.user_id=b.user_id AND e.bucket_id=b.id),0) AS expenses_spent,
 COALESCE((SELECT SUM(p.amount) FROM debt_payments p WHERE p.user_id=b.user_id AND p.bucket_id=b.id),0) AS debt_paid_gross,
 COALESCE((SELECT SUM(r.amount) FROM debt_payment_reversals r JOIN debt_payments p ON p.id=r.debt_payment_id WHERE p.user_id=b.user_id AND p.bucket_id=b.id),0) AS debt_reversed,
 COALESCE((SELECT SUM(p.amount) FROM debt_payments p WHERE p.user_id=b.user_id AND p.bucket_id=b.id),0)-COALESCE((SELECT SUM(r.amount) FROM debt_payment_reversals r JOIN debt_payments p ON p.id=r.debt_payment_id WHERE p.user_id=b.user_id AND p.bucket_id=b.id),0) AS debt_paid,
 COALESCE((SELECT SUM(p.amount) FROM obligation_payments p WHERE p.user_id=b.user_id AND p.bucket_id=b.id),0) AS obligations_paid_gross,
 COALESCE((SELECT SUM(r.amount) FROM obligation_payment_reversals r JOIN obligation_payments p ON p.id=r.obligation_payment_id WHERE p.user_id=b.user_id AND p.bucket_id=b.id),0) AS obligations_reversed,
 COALESCE((SELECT amount FROM obligation_payment_bucket_net n WHERE n.user_id=b.user_id AND n.bucket_id=b.id),0) AS obligations_paid,
 COALESCE((SELECT SUM(t.amount) FROM bucket_funding_transfers t WHERE t.user_id=b.user_id AND t.source_bucket_id=b.id),0) AS funding_transfers_gross,
 COALESCE((SELECT SUM(r.amount) FROM bucket_funding_transfer_reversals r JOIN bucket_funding_transfers t ON t.id=r.transfer_id WHERE t.user_id=b.user_id AND t.source_bucket_id=b.id),0) AS funding_transfers_reversed,
 COALESCE((SELECT amount FROM bucket_funding_transfer_net n WHERE n.user_id=b.user_id AND n.source_bucket_id=b.id),0) AS funding_transfers_net,
 ROUND(
  COALESCE((SELECT SUM(a.amount) FROM income_bucket_allocations a WHERE a.user_id=b.user_id AND a.bucket_id=b.id),0)
  -(COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.user_id=b.user_id AND e.bucket_id=b.id),0)-COALESCE((SELECT SUM(r.amount) FROM irregular_expense_payment_reversals r JOIN expenses e ON e.id=r.expense_id WHERE e.user_id=b.user_id AND e.bucket_id=b.id),0))
  -COALESCE((SELECT SUM(p.amount) FROM debt_payments p WHERE p.user_id=b.user_id AND p.bucket_id=b.id),0)
  +COALESCE((SELECT SUM(r.amount) FROM debt_payment_reversals r JOIN debt_payments p ON p.id=r.debt_payment_id WHERE p.user_id=b.user_id AND p.bucket_id=b.id),0)
  -COALESCE((SELECT amount FROM obligation_payment_bucket_net n WHERE n.user_id=b.user_id AND n.bucket_id=b.id),0)
  -COALESCE((SELECT amount FROM bucket_funding_transfer_net n WHERE n.user_id=b.user_id AND n.source_bucket_id=b.id),0),2
 ) AS available
FROM income_buckets b
ORDER BY b.user_id,b.sort_order,b.title;

-- AUDIT: irregular payment reversals and their linked expense facts
SELECT r.user_id,r.id AS reversal_id,r.irregular_expense_payment_id,p.expense_id,
 r.amount AS reversed_amount,r.reversed_on,r.reason,
 p.amount AS payment_amount,e.amount AS expense_amount,e.bucket_id,o.status AS occurrence_status
FROM irregular_expense_payment_reversals r
JOIN irregular_expense_payments p ON p.id=r.irregular_expense_payment_id AND p.user_id=r.user_id
JOIN expenses e ON e.id=r.expense_id AND e.user_id=r.user_id
LEFT JOIN irregular_expense_payment_occurrences o
 ON o.irregular_expense_id=p.irregular_expense_id AND o.scheduled_due_date=p.scheduled_due_date
ORDER BY r.user_id,r.reversed_on,r.id;

