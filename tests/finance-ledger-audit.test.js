import test from "node:test";
import assert from "node:assert/strict";
import {readdirSync,readFileSync} from "node:fs";
import {join,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {DatabaseSync} from "node:sqlite";

const root=join(dirname(fileURLToPath(import.meta.url)),"..");
const audit=readFileSync(join(root,"scripts/audit-finance-ledgers.sql"),"utf8");
function statements(){
 return audit.split(/^-- AUDIT: .*$/m).slice(1).map(block=>block.trim()).filter(Boolean);
}
function database(){
 const db=new DatabaseSync(":memory:");
 db.exec(readFileSync(join(root,"schema.sql"),"utf8"));
 for(const name of readdirSync(join(root,"migrations")).filter(x=>/^\d+_.+\.sql$/.test(x)).sort((a,b)=>a.localeCompare(b))){
  db.exec(readFileSync(join(root,"migrations",name),"utf8"));
 }
 db.prepare("INSERT INTO users(id,email,password_hash,password_salt) VALUES(?,?,?,?)").run("u","audit@example.test","hash","salt");
 return db;
}

test("finance ledger audit contains SELECT-only reports and executes against migrated schema",()=>{
 const queries=statements();
 assert.equal(queries.length,7);
 for(const query of queries)assert.match(query,/^(SELECT|WITH)\b/i);
 const db=database();
 try{
  for(const query of queries)assert.doesNotThrow(()=>db.prepare(query).all());
 }finally{db.close();}
});

test("read-only audit classifies ambiguous and unmatched irregular payment history",()=>{
 const queries=statements();
 const db=database();
 try{
  db.prepare("INSERT INTO irregular_expenses(id,user_id,title,category,amount,next_date,frequency) VALUES(?,?,?,?,?,?,?)").run("sched","u","Страховка","Дом",12000,"2026-11-16","yearly");
  db.prepare("INSERT INTO expenses(id,user_id,category,title,amount,spent_on,note) VALUES(?,?,?,?,?,?,?)").run("e1","u","Дом","Страховка",12000,"2026-10-10","Оплата нерегулярного расхода");
  for(const id of ["p1","p2"])db.prepare("INSERT INTO irregular_expense_payments(id,user_id,irregular_expense_id,amount,paid_on) VALUES(?,?,?,?,?)").run(id,"u","sched",12000,"2026-10-10");
  db.prepare("INSERT INTO irregular_expense_payments(id,user_id,irregular_expense_id,amount,paid_on) VALUES(?,?,?,?,?)").run("p3","u","sched",5000,"2026-10-11");
  const unlinked=db.prepare(queries[0]).all();
  assert.equal(unlinked.length,3);
  assert.equal(unlinked.find(x=>x.payment_id==="p1").audit_class,"ambiguous_match");
  assert.equal(unlinked.find(x=>x.payment_id==="p3").audit_class,"no_matching_expense");
  const unmatchedExpenses=db.prepare(queries[1]).all();
  assert.equal(unmatchedExpenses.length,0);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM expenses").get().count,1);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM irregular_expense_payments").get().count,3);
 }finally{db.close();}
});

test("audit identifies generated expense rows that have no corresponding payment",()=>{
 const queries=statements();
 const db=database();
 try{
  db.prepare("INSERT INTO expenses(id,user_id,category,title,amount,spent_on,note) VALUES(?,?,?,?,?,?,?)").run("orphan","u","Дом","Старая оплата",800,"2026-01-01","Оплата нерегулярного расхода");
  const rows=db.prepare(queries[1]).all();
  assert.equal(rows.length,1);
  assert.equal(rows[0].expense_id,"orphan");
 }finally{db.close();}
});

test("ledger audit reconciles debt, obligation and irregular expense without double counting",()=>{
 const queries=statements();
 const db=database();
 try{
  db.prepare("INSERT INTO income_buckets(id,user_id,title,percentage) VALUES(?,?,?,?)").run("b","u","Основная",100);
  db.prepare("INSERT INTO income_entries(id,user_id,amount,received_on) VALUES(?,?,?,?)").run("i","u",100,"2026-11-01");
  db.prepare("INSERT INTO income_bucket_allocations(id,user_id,income_id,bucket_id,percentage,amount) VALUES(?,?,?,?,?,?)").run("a","u","i","b",100,100);
  db.prepare("INSERT INTO expenses(id,user_id,category,title,amount,spent_on,note,bucket_id) VALUES(?,?,?,?,?,?,?,?)").run("e","u","Дом","Страховка",10,"2026-11-10","Оплата нерегулярного расхода","b");
  db.prepare("INSERT INTO irregular_expenses(id,user_id,title,category,amount,next_date,frequency) VALUES(?,?,?,?,?,?,?)").run("ir","u","Страховка","Дом",10,"2026-12-10","yearly");
  db.prepare("INSERT INTO irregular_expense_payments(id,user_id,irregular_expense_id,amount,paid_on,expense_id) VALUES(?,?,?,?,?,?)").run("ip","u","ir",10,"2026-11-10","e");
  db.prepare("INSERT INTO debts(id,user_id,title,initial_amount,balance) VALUES(?,?,?,?,?)").run("d","u","Кредит",100,100);
  db.prepare("INSERT INTO debt_payments(id,user_id,debt_id,amount,paid_on,bucket_id) VALUES(?,?,?,?,?,?)").run("dp","u","d",20,"2026-11-11","b");
  db.prepare("INSERT INTO payment_obligations(id,user_id,title,amount,due_date) VALUES(?,?,?,?,?)").run("o","u","Интернет",15,"2026-12-01");
  db.prepare("INSERT INTO obligation_payments(id,user_id,obligation_id,amount,paid_on,bucket_id,scheduled_due_date) VALUES(?,?,?,?,?,?,?)").run("op","u","o",15,"2026-11-12","b","2026-11-01");
  assert.deepEqual(db.prepare(queries[3]).all(),[]);
  const obligation=db.prepare(queries[4]).get();
  assert.equal(obligation.recorded_paid,15);
  assert.equal(obligation.reversed_paid,0);
  assert.equal(obligation.net_paid,15);
  const bucket=db.prepare(queries[5]).get();
  assert.equal(bucket.allocated,100);
  assert.equal(bucket.expenses_spent,10);
  assert.equal(bucket.debt_paid_gross,20);
  assert.equal(bucket.debt_reversed,0);
  assert.equal(bucket.debt_paid,20);
  assert.equal(bucket.obligations_paid,15);
  assert.equal(bucket.funding_transfers_net,0);
  assert.equal(bucket.available,55);
  assert.equal(db.prepare("SELECT balance FROM debts WHERE id='d'").get().balance,80);
 }finally{db.close();}
});


test("debt payment reversal restores debt and bucket exactly once without mutating source ledger",()=>{
 const db=database();
 try{
  db.prepare("INSERT INTO income_buckets(id,user_id,title,percentage) VALUES(?,?,?,?)").run("b","u","Долги и обязательства",100);
  db.prepare("INSERT INTO income_entries(id,user_id,amount,received_on) VALUES(?,?,?,?)").run("i","u",100,"2026-11-01");
  db.prepare("INSERT INTO income_bucket_allocations(id,user_id,income_id,bucket_id,percentage,amount) VALUES(?,?,?,?,?,?)").run("a","u","i","b",100,100);
  db.prepare("INSERT INTO debts(id,user_id,title,initial_amount,balance) VALUES(?,?,?,?,?)").run("d","u","Кредит",100,100);
  db.prepare("INSERT INTO debt_payments(id,user_id,debt_id,amount,paid_on,bucket_id) VALUES(?,?,?,?,?,?)").run("dp","u","d",40,"2026-11-10","b");
  assert.equal(db.prepare("SELECT balance FROM debts WHERE id='d'").get().balance,60);
  db.prepare("INSERT INTO debt_payment_reversals(id,user_id,debt_payment_id,amount,reversed_on,reason,request_id) VALUES(?,?,?,?,?,?,?)").run("rev","u","dp",40,"2026-11-12","Платёж внесён ошибочно","request-123456789");
  assert.equal(db.prepare("SELECT balance FROM debts WHERE id='d'").get().balance,100);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM debt_payments").get().count,1);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM debt_payment_reversals").get().count,1);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type='trigger' AND tbl_name='debt_payment_reversals' AND name LIKE '%immutable%'").get().count,2);
  assert.throws(()=>db.prepare("INSERT INTO debt_payment_reversals(id,user_id,debt_payment_id,amount,reversed_on,reason) VALUES(?,?,?,?,?,?)").run("rev2","u","dp",40,"2026-11-13","Повторная отмена"));
  const bucket=db.prepare("SELECT 100-COALESCE((SELECT amount FROM debt_payment_bucket_net WHERE user_id='u' AND bucket_id='b'),0) available").get();
  assert.equal(bucket.available,100);
  const auditedBucket=db.prepare(statements()[5]).get();
  assert.equal(auditedBucket.debt_paid,0);
  assert.equal(auditedBucket.debt_reversed,40);
  assert.equal(auditedBucket.available,100);
  assert.throws(()=>db.prepare("INSERT INTO debt_payment_reversals(id,user_id,debt_payment_id,amount,reversed_on,reason) VALUES(?,?,?,?,?,?)").run("bad","u","dp",39,"2026-11-13","Неверная сумма"));
 }finally{db.close();}
});

test("restored debt-payment amount is spendable under database bucket guards",()=>{
 const db=database();
 try{
  db.prepare("INSERT INTO income_buckets(id,user_id,title,percentage) VALUES(?,?,?,?)").run("b","u","Основная",100);
  db.prepare("INSERT INTO income_entries(id,user_id,amount,received_on) VALUES(?,?,?,?)").run("i","u",50,"2026-11-01");
  db.prepare("INSERT INTO income_bucket_allocations(id,user_id,income_id,bucket_id,percentage,amount) VALUES(?,?,?,?,?,?)").run("a","u","i","b",100,50);
  db.prepare("INSERT INTO debts(id,user_id,title,initial_amount,balance) VALUES(?,?,?,?,?)").run("d","u","Кредит",50,50);
  db.prepare("INSERT INTO debt_payments(id,user_id,debt_id,amount,paid_on,bucket_id) VALUES(?,?,?,?,?,?)").run("dp","u","d",30,"2026-11-10","b");
  db.prepare("INSERT INTO debt_payment_reversals(id,user_id,debt_payment_id,amount,reversed_on,reason) VALUES(?,?,?,?,?,?)").run("rev","u","dp",30,"2026-11-12","Исправление ошибочной оплаты");
  db.prepare("INSERT INTO expenses(id,user_id,category,title,amount,spent_on,bucket_id) VALUES(?,?,?,?,?,?,?)").run("e","u","Прочее","Расход",30,"2026-11-13","b");
  assert.equal(db.prepare("SELECT balance FROM debts WHERE id='d'").get().balance,50);
  assert.equal(db.prepare("SELECT amount FROM debt_payment_bucket_net WHERE user_id='u' AND bucket_id='b'").get().amount,0);
 }finally{db.close();}
});

test("obligation payment reversal reopens only its occurrence and preserves later schedule cursor",()=>{
 const db=database();
 try{
  db.prepare("INSERT INTO income_buckets(id,user_id,title,percentage) VALUES(?,?,?,?)").run("b","u","Основная",100);
  db.prepare("INSERT INTO income_entries(id,user_id,amount,received_on) VALUES(?,?,?,?)").run("i","u",100,"2026-11-01");
  db.prepare("INSERT INTO income_bucket_allocations(id,user_id,income_id,bucket_id,percentage,amount) VALUES(?,?,?,?,?,?)").run("a","u","i","b",100,100);
  db.prepare("INSERT INTO payment_obligations(id,user_id,title,amount,due_date,frequency,recurrence_day,category) VALUES(?,?,?,?,?,?,?,?)").run("o","u","Интернет",15,"2026-10-01","monthly",1,"Долги и обязательства");
  db.prepare("INSERT INTO obligation_payments(id,user_id,obligation_id,amount,paid_on,bucket_id,scheduled_due_date,request_id) VALUES(?,?,?,?,?,?,?,?)").run("op1","u","o",15,"2026-10-01","b","2026-10-01","request-obligation-1");
  db.prepare("UPDATE payment_obligations SET due_date='2026-11-01' WHERE id='o'").run();
  db.prepare("INSERT INTO obligation_payments(id,user_id,obligation_id,amount,paid_on,bucket_id,scheduled_due_date,request_id) VALUES(?,?,?,?,?,?,?,?)").run("op2","u","o",15,"2026-11-01","b","2026-11-01","request-obligation-2");
  db.prepare("UPDATE payment_obligations SET due_date='2026-12-01' WHERE id='o'").run();
  db.prepare("INSERT INTO obligation_payment_reversals(id,user_id,obligation_payment_id,amount,reversed_on,reason,request_id) VALUES(?,?,?,?,?,?,?)").run("or1","u","op1",15,"2026-11-15","Ошибочная оплата","reverse-obligation-1");
  assert.equal(db.prepare("SELECT status FROM obligation_payment_occurrences WHERE obligation_id='o' AND scheduled_due_date='2026-10-01'").get().status,"unpaid");
  assert.equal(db.prepare("SELECT status FROM obligation_payment_occurrences WHERE obligation_id='o' AND scheduled_due_date='2026-11-01'").get().status,"paid");
  const reversalTrigger=db.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name='trg_obligation_payment_reversal_after_insert'").get().sql;
  assert.doesNotMatch(reversalTrigger,/UPDATE\s+payment_obligations|due_date/i);
  assert.equal(db.prepare("SELECT due_date FROM payment_obligations WHERE id='o'").get().due_date,"2026-12-01");
  assert.equal(db.prepare("SELECT amount FROM obligation_payment_bucket_net WHERE user_id='u' AND bucket_id='b'").get().amount,15);
  assert.throws(()=>db.prepare("INSERT INTO obligation_payments(id,user_id,obligation_id,amount,paid_on,bucket_id,scheduled_due_date) VALUES(?,?,?,?,?,?,?)").run("op3","u","o",15,"2026-11-16","b","2026-11-01"));
  db.prepare("INSERT INTO obligation_payments(id,user_id,obligation_id,amount,paid_on,bucket_id,scheduled_due_date,request_id) VALUES(?,?,?,?,?,?,?,?)").run("op4","u","o",15,"2026-11-16","b","2026-10-01","request-obligation-4");
  assert.equal(db.prepare("SELECT status FROM obligation_payment_occurrences WHERE obligation_id='o' AND scheduled_due_date='2026-10-01'").get().status,"paid");
  assert.equal(db.prepare("SELECT due_date FROM payment_obligations WHERE id='o'").get().due_date,"2026-12-01");
  assert.equal(db.prepare("SELECT amount FROM obligation_payment_bucket_net WHERE user_id='u' AND bucket_id='b'").get().amount,30);
  const audited=db.prepare(statements()[5]).get();
  assert.equal(audited.obligations_paid_gross,45);
  assert.equal(audited.obligations_reversed,15);
  assert.equal(audited.obligations_paid,30);
  assert.equal(audited.available,70);
  assert.throws(()=>db.prepare("UPDATE obligation_payment_reversals SET reason='изменено'").run());
  assert.throws(()=>db.prepare("DELETE FROM obligation_payment_reversals").run());
 }finally{db.close();}
});
 
test("fully repaid debt closes, reversal of the final payment reopens it, and repayment closes it again",()=>{
 const db=database();
 try{
  db.prepare("INSERT INTO income_buckets(id,user_id,title,percentage) VALUES(?,?,?,?)").run("b","u","Долги и обязательства",100);
  db.prepare("INSERT INTO income_entries(id,user_id,amount,received_on) VALUES(?,?,?,?)").run("i","u",100,"2026-11-01");
  db.prepare("INSERT INTO income_bucket_allocations(id,user_id,income_id,bucket_id,percentage,amount) VALUES(?,?,?,?,?,?)").run("a","u","i","b",100,100);
  db.prepare("INSERT INTO debts(id,user_id,title,initial_amount,balance) VALUES(?,?,?,?,?)").run("d","u","Кредит",100,100);
  db.prepare("INSERT INTO debt_payments(id,user_id,debt_id,amount,paid_on,bucket_id,request_id) VALUES(?,?,?,?,?,?,?)").run("p1","u","d",100,"2026-11-10","b","debt-payment-close-001");
  let debt=db.prepare("SELECT balance,status FROM debts WHERE id='d'").get();
  assert.equal(debt.balance,0);
  assert.equal(debt.status,"closed");
  db.prepare("INSERT INTO debt_payment_reversals(id,user_id,debt_payment_id,amount,reversed_on,reason,request_id) VALUES(?,?,?,?,?,?,?)").run("r1","u","p1",100,"2026-11-12","Ошибочно внесённый платёж","debt-reversal-001");
  debt=db.prepare("SELECT balance,status FROM debts WHERE id='d'").get();
  assert.equal(debt.balance,100);
  assert.equal(debt.status,"open");
  assert.equal(db.prepare("SELECT COUNT(*) count FROM debt_payments WHERE id='p1'").get().count,1);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM debt_payment_reversals WHERE debt_payment_id='p1'").get().count,1);
  assert.equal(db.prepare("SELECT amount FROM debt_payment_bucket_net WHERE user_id='u' AND bucket_id='b'").get().amount,0);
  db.prepare("INSERT INTO debt_payments(id,user_id,debt_id,amount,paid_on,bucket_id,request_id) VALUES(?,?,?,?,?,?,?)").run("p2","u","d",100,"2026-11-13","b","debt-payment-close-002");
  debt=db.prepare("SELECT balance,status FROM debts WHERE id='d'").get();
  assert.equal(debt.balance,0);
  assert.equal(debt.status,"closed");
  assert.equal(db.prepare("SELECT COUNT(*) count FROM debt_payments WHERE debt_id='d'").get().count,2);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM debt_payment_reversals WHERE debt_payment_id='p1'").get().count,1);
  assert.equal(db.prepare("SELECT amount FROM debt_payment_bucket_net WHERE user_id='u' AND bucket_id='b'").get().amount,100);
 }finally{db.close();}
});
 
test("current-month debt payment offset ignores reversals of payments from earlier months",()=>{
 const db=database();
 try{
  db.prepare("INSERT INTO debts(id,user_id,title,initial_amount,balance) VALUES(?,?,?,?,?)").run("d","u","Кредит",1000,1000);
  db.prepare("INSERT INTO debt_payments(id,user_id,debt_id,amount,paid_on) VALUES(?,?,?,?,?)").run("old","u","d",100,"2026-10-30");
  db.prepare("INSERT INTO debt_payment_reversals(id,user_id,debt_payment_id,amount,reversed_on,reason) VALUES(?,?,?,?,?,?)").run("old-reversal","u","old",100,"2026-11-02","Возврат старого платежа");
  db.prepare("INSERT INTO debt_payments(id,user_id,debt_id,amount,paid_on) VALUES(?,?,?,?,?)").run("current-reversed","u","d",200,"2026-11-03");
  db.prepare("INSERT INTO debt_payment_reversals(id,user_id,debt_payment_id,amount,reversed_on,reason) VALUES(?,?,?,?,?,?)").run("current-reversal","u","current-reversed",200,"2026-11-04","Отмена платежа текущего месяца");
  db.prepare("INSERT INTO debt_payments(id,user_id,debt_id,amount,paid_on) VALUES(?,?,?,?,?)").run("current-valid","u","d",50,"2026-11-05");
  const row=db.prepare("SELECT p.debt_id,SUM(p.amount-COALESCE(r.amount,0)) AS paid_this_month FROM debt_payments p LEFT JOIN debt_payment_reversals r ON r.debt_payment_id=p.id AND r.user_id=p.user_id WHERE p.user_id=? AND p.paid_on>=? AND p.paid_on<=? GROUP BY p.debt_id").get("u","2026-11-01","2026-11-30");
  assert.equal(row.paid_this_month,50);
 }finally{db.close();}
});

test("combined expense, debt, obligation, irregular payment and goal/reserve transfers reconcile exactly through reversals",()=>{
 const queries=statements(),db=database();
 try{
  db.prepare("INSERT INTO income_buckets(id,user_id,title,percentage) VALUES(?,?,?,?)").run("b","u","Общая",100);
  db.prepare("INSERT INTO income_entries(id,user_id,amount,received_on) VALUES(?,?,?,?)").run("i","u",100,"2026-11-01");
  db.prepare("INSERT INTO income_bucket_allocations(id,user_id,income_id,bucket_id,percentage,amount) VALUES(?,?,?,?,?,?)").run("a","u","i","b",100,100);
  db.prepare("INSERT INTO financial_goals(id,user_id,title,target_amount,saved_amount) VALUES(?,?,?,?,?)").run("g","u","Цель",100,0);
  db.prepare("INSERT INTO cash_reserves(id,user_id,title,target_amount,current_amount) VALUES(?,?,?,?,?)").run("r","u","Резерв",100,0);
  db.prepare("INSERT INTO bucket_funding_transfers(id,user_id,source_bucket_id,target_type,target_id,amount,transferred_on,request_id) VALUES(?,?,?,?,?,?,?,?)").run("tg","u","b","goal","g",20,"2026-11-01","transfer-goal-0001");
  db.prepare("INSERT INTO bucket_funding_transfers(id,user_id,source_bucket_id,target_type,target_id,amount,transferred_on,request_id) VALUES(?,?,?,?,?,?,?,?)").run("tr","u","b","reserve","r",30,"2026-11-01","transfer-reserve-01");
  db.prepare("INSERT INTO expenses(id,user_id,title,amount,spent_on,bucket_id) VALUES(?,?,?,?,?,?)").run("e","u","Обычный расход",10,"2026-11-02","b");
  db.prepare("INSERT INTO irregular_expenses(id,user_id,title,category,amount,next_date,frequency) VALUES(?,?,?,?,?,?,?)").run("ir","u","Нерегулярный","Общая",10,"2026-11-03","yearly");
  db.prepare("INSERT INTO expenses(id,user_id,title,amount,spent_on,bucket_id) VALUES(?,?,?,?,?,?)").run("ei","u","Оплата нерегулярного",10,"2026-11-03","b");
  db.prepare("INSERT INTO irregular_expense_payments(id,user_id,irregular_expense_id,amount,paid_on,expense_id,scheduled_due_date,request_id) VALUES(?,?,?,?,?,?,?,?)").run("ip","u","ir",10,"2026-11-03","ei","2026-11-03","irregular-payment-01");
  db.prepare("INSERT INTO debts(id,user_id,title,initial_amount,balance) VALUES(?,?,?,?,?)").run("d","u","Долг",100,100);
  db.prepare("INSERT INTO debt_payments(id,user_id,debt_id,amount,paid_on,bucket_id,request_id) VALUES(?,?,?,?,?,?,?)").run("dp","u","d",10,"2026-11-04","b","debt-payment-00001");
  db.prepare("INSERT INTO payment_obligations(id,user_id,title,amount,due_date,frequency) VALUES(?,?,?,?,?,?)").run("o","u","Обязательство",10,"2026-11-05","monthly");
  db.prepare("INSERT INTO obligation_payments(id,user_id,obligation_id,amount,paid_on,bucket_id,scheduled_due_date,request_id) VALUES(?,?,?,?,?,?,?,?)").run("op","u","o",10,"2026-11-05","b","2026-11-05","obligation-payment-1");
  const available=()=>Number(db.prepare("SELECT 100-COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.user_id='u' AND e.bucket_id='b'),0)+COALESCE((SELECT SUM(r.amount) FROM irregular_expense_payment_reversals r JOIN expenses e ON e.id=r.expense_id WHERE r.user_id='u' AND e.bucket_id='b'),0)-COALESCE((SELECT amount FROM debt_payment_bucket_net WHERE user_id='u' AND bucket_id='b'),0)-COALESCE((SELECT amount FROM obligation_payment_bucket_net WHERE user_id='u' AND bucket_id='b'),0)-COALESCE((SELECT amount FROM bucket_funding_transfer_net WHERE user_id='u' AND source_bucket_id='b'),0) AS amount").get().amount);
  assert.equal(available(),10);
  assert.equal(db.prepare(queries[5]).get().available,10);
  db.prepare("INSERT INTO debt_payment_reversals(id,user_id,debt_payment_id,amount,reversed_on,reason,request_id) VALUES(?,?,?,?,?,?,?)").run("dr","u","dp",10,"2026-11-06","Корректировка","debt-reversal-01");
  db.prepare("INSERT INTO obligation_payment_reversals(id,user_id,obligation_payment_id,amount,reversed_on,reason,request_id) VALUES(?,?,?,?,?,?,?)").run("or","u","op",10,"2026-11-06","Корректировка","obligation-reversal-01");
  db.prepare("INSERT INTO irregular_expense_payment_reversals(id,user_id,irregular_expense_payment_id,expense_id,amount,reversed_on,reason,request_id) VALUES(?,?,?,?,?,?,?,?)").run("irv","u","ip","ei",10,"2026-11-06","Корректировка","irregular-reversal-01");
  assert.equal(available(),40);
  assert.equal(db.prepare(queries[5]).get().available,40);
  db.prepare("INSERT INTO bucket_funding_transfer_reversals(id,user_id,transfer_id,amount,reversed_on,reason,request_id) VALUES(?,?,?,?,?,?,?)").run("gr","u","tg",20,"2026-11-07","Корректировка","goal-reversal-0001");
  db.prepare("INSERT INTO bucket_funding_transfer_reversals(id,user_id,transfer_id,amount,reversed_on,reason,request_id) VALUES(?,?,?,?,?,?,?)").run("rr","u","tr",30,"2026-11-07","Корректировка","reserve-reversal-01");
  assert.equal(available(),90);
  assert.equal(db.prepare(queries[5]).get().available,90);
  assert.equal(db.prepare("SELECT balance FROM debts WHERE id='d'").get().balance,100);
  assert.equal(db.prepare("SELECT current_amount FROM cash_reserves WHERE id='r'").get().current_amount,0);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM expenses WHERE id IN ('e','ei')").get().count,2);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM debt_payments WHERE id='dp'").get().count,1);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM obligation_payments WHERE id='op'").get().count,1);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM irregular_expense_payments WHERE id='ip'").get().count,1);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM bucket_funding_transfers").get().count,2);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM bucket_funding_transfer_reversals").get().count,2);
 }finally{db.close();}
});
