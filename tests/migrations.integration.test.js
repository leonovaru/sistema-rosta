import test from "node:test";
import assert from "node:assert/strict";
import {readdirSync,readFileSync} from "node:fs";
import {join,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {DatabaseSync} from "node:sqlite";

const root=join(dirname(fileURLToPath(import.meta.url)),"..");

test("base schema and every ordered D1 migration apply to a clean SQLite database",()=>{
 const db=new DatabaseSync(":memory:");
 try{
  db.exec(readFileSync(join(root,"schema.sql"),"utf8"));
  const migrations=readdirSync(join(root,"migrations"))
   .filter(name=>/^[0-9]+_.+\.sql$/.test(name))
   .sort((a,b)=>a.localeCompare(b));
  assert.ok(migrations.length>=50,"expected the complete migration history");
  for(const name of migrations){
   try{db.exec(readFileSync(join(root,"migrations",name),"utf8"));}
   catch(error){throw new Error(`Migration ${name} failed: ${error.message}`);}
  }
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row=>row.name);
  for(const name of ["task_time_entries","daily_task_allocations","daily_block_logs","planned_cashflow_realizations","planned_cashflows","clients","projects","deals"]){
   assert.ok(tables.includes(name),`missing table ${name}`);
  }
  const triggers=db.prepare("SELECT name FROM sqlite_master WHERE type='trigger'").all().map(row=>row.name);
  for(const name of ["trg_cashflow_realization_before_insert","trg_cashflow_realization_after_insert","trg_cashflow_realization_after_delete","trg_cashflow_income_amount_guard","trg_cashflow_expense_amount_guard","trg_bucket_expense_balance_insert","trg_bucket_debt_payment_balance_insert","trg_bucket_obligation_payment_balance_insert","trg_debt_payment_balance_before_insert","trg_debt_payment_balance_after_insert","trg_bucket_allocation_validate_insert","trg_bucket_allocation_balance_update","trg_bucket_allocation_balance_delete","trg_income_amount_allocation_guard"]){
   assert.ok(triggers.includes(name),`missing trigger ${name}`);
  }
  db.prepare("INSERT INTO users(id,email,password_hash,password_salt) VALUES(?,?,?,?)").run("u1","u1@example.test","hash","salt");
  db.prepare("INSERT INTO projects(id,user_id,title) VALUES(?,?,?)").run("project1","u1","Проект");
  db.prepare("INSERT INTO planned_cashflows(id,user_id,flow_type,title,amount,expected_date,project_id) VALUES(?,?,?,?,?,?,?)").run("plan1","u1","income","Этап проекта",1000,"2026-12-01","project1");
  db.prepare("INSERT INTO income_entries(id,user_id,amount,received_on,project_id) VALUES(?,?,?,?,?)").run("income1","u1",600,"2026-11-16","project1");
  db.prepare("INSERT INTO planned_cashflow_realizations(id,user_id,planned_cashflow_id,income_entry_id,amount) VALUES(?,?,?,?,?)").run("real1","u1","plan1","income1",600);
  assert.equal(db.prepare("SELECT status FROM planned_cashflows WHERE id='plan1'").get().status,"planned");
  assert.throws(()=>db.prepare("UPDATE income_entries SET amount=1200 WHERE id='income1'").run(),/Изменение суммы превысит плановый платёж/);
  db.prepare("UPDATE income_entries SET amount=1000 WHERE id='income1'").run();
  assert.equal(db.prepare("SELECT amount FROM planned_cashflow_realizations WHERE id='real1'").get().amount,1000);
  assert.equal(db.prepare("SELECT status FROM planned_cashflows WHERE id='plan1'").get().status,"realized");
  db.prepare("DELETE FROM income_entries WHERE id='income1'").run();
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM planned_cashflow_realizations WHERE id='real1'").get().count,0);
  assert.equal(db.prepare("SELECT status FROM planned_cashflows WHERE id='plan1'").get().status,"planned");
  db.prepare("INSERT INTO income_entries(id,user_id,amount,received_on,project_id) VALUES(?,?,?,?,?)").run("income2","u1",1200,"2026-11-17","project1");
  assert.throws(()=>db.prepare("INSERT INTO planned_cashflow_realizations(id,user_id,planned_cashflow_id,income_entry_id,amount) VALUES(?,?,?,?,?)").run("real2","u1","plan1","income2",1200),/Плановый платёж недоступен или превышен/);
  // A valid actual can be linked once; unique indexes protect duplicate/concurrent links.
  db.prepare("INSERT INTO planned_cashflows(id,user_id,flow_type,title,amount,expected_date,project_id) VALUES(?,?,?,?,?,?,?)").run("plan2","u1","income","Другой этап",1500,"2026-12-02","project1");
  db.prepare("INSERT INTO planned_cashflows(id,user_id,flow_type,title,amount,expected_date,project_id) VALUES(?,?,?,?,?,?,?)").run("plan3","u1","income","Третий этап",1500,"2026-12-03","project1");
  db.prepare("INSERT INTO planned_cashflow_realizations(id,user_id,planned_cashflow_id,income_entry_id,amount) VALUES(?,?,?,?,?)").run("real2","u1","plan2","income2",1200);
  assert.throws(()=>db.prepare("INSERT INTO planned_cashflow_realizations(id,user_id,planned_cashflow_id,income_entry_id,amount) VALUES(?,?,?,?,?)").run("real_duplicate","u1","plan3","income2",1200),/UNIQUE constraint failed|Период обязательства уже оплачен/);
  assert.throws(()=>db.prepare("UPDATE planned_cashflow_realizations SET amount=1199 WHERE id='real2'").run(),/Связь не соответствует фактической операции/);
  // A realization must match the actual operation's amount, project, owner and flow type.
  db.prepare("INSERT INTO income_entries(id,user_id,amount,received_on,project_id) VALUES(?,?,?,?,?)").run("income3","u1",1000,"2026-11-18","project1");
  assert.throws(()=>db.prepare("INSERT INTO planned_cashflow_realizations(id,user_id,planned_cashflow_id,income_entry_id,amount) VALUES(?,?,?,?,?)").run("real_wrong_amount","u1","plan3","income3",900),/Связь не соответствует фактической операции/);
  db.prepare("INSERT INTO users(id,email,password_hash,password_salt) VALUES(?,?,?,?)").run("u2","u2@example.test","hash","salt");
  db.prepare("INSERT INTO income_entries(id,user_id,amount,received_on) VALUES(?,?,?,?)").run("income_other_user","u2",100,"2026-11-19");
  assert.throws(()=>db.prepare("INSERT INTO planned_cashflow_realizations(id,user_id,planned_cashflow_id,income_entry_id,amount) VALUES(?,?,?,?,?)").run("real_wrong_owner","u1","plan3","income_other_user",100),/Связь не соответствует фактической операции/);
  db.prepare("INSERT INTO planned_cashflows(id,user_id,flow_type,title,amount,expected_date,project_id) VALUES(?,?,?,?,?,?,?)").run("wrong_type_plan","u1","expense","Неверный тип",1500,"2026-12-04","project1");
  assert.throws(()=>db.prepare("INSERT INTO planned_cashflow_realizations(id,user_id,planned_cashflow_id,income_entry_id,amount) VALUES(?,?,?,?,?)").run("real_wrong_type","u1","wrong_type_plan","income3",1000),/Связь не соответствует фактической операции/);
  // Expense realizations follow the same partial/full, amount-sync and delete rules.
  db.prepare("INSERT INTO planned_cashflows(id,user_id,flow_type,title,amount,expected_date,project_id) VALUES(?,?,?,?,?,?,?)").run("expense_plan","u1","expense","Расход проекта",500,"2026-12-10","project1");
  db.prepare("INSERT INTO expenses(id,user_id,title,amount,spent_on,project_id) VALUES(?,?,?,?,?,?)").run("expense_actual","u1","Первая часть",300,"2026-11-16","project1");
  db.prepare("INSERT INTO planned_cashflow_realizations(id,user_id,planned_cashflow_id,expense_id,amount) VALUES(?,?,?,?,?)").run("expense_real","u1","expense_plan","expense_actual",300);
  assert.equal(db.prepare("SELECT status FROM planned_cashflows WHERE id='expense_plan'").get().status,"planned");
  assert.throws(()=>db.prepare("UPDATE expenses SET amount=600 WHERE id='expense_actual'").run(),/Изменение суммы превысит плановый платёж/);
  assert.equal(db.prepare("SELECT amount FROM expenses WHERE id='expense_actual'").get().amount,300);
  db.prepare("UPDATE expenses SET amount=500 WHERE id='expense_actual'").run();
  assert.equal(db.prepare("SELECT amount FROM planned_cashflow_realizations WHERE id='expense_real'").get().amount,500);
  assert.equal(db.prepare("SELECT status FROM planned_cashflows WHERE id='expense_plan'").get().status,"realized");
  db.prepare("DELETE FROM expenses WHERE id='expense_actual'").run();
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM planned_cashflow_realizations WHERE id='expense_real'").get().count,0);
  assert.equal(db.prepare("SELECT status FROM planned_cashflows WHERE id='expense_plan'").get().status,"planned");

  // Partial payment deletion must reopen a plan, while a cancelled plan stays cancelled.
  db.prepare("INSERT INTO planned_cashflows(id,user_id,flow_type,title,amount,expected_date) VALUES(?,?,?,?,?,?)").run("cancelled_plan","u1","expense","Отменённый платёж",100,"2026-12-11");
  db.prepare("UPDATE planned_cashflows SET status='cancelled' WHERE id='cancelled_plan'").run();
  db.prepare("INSERT INTO expenses(id,user_id,title,amount,spent_on) VALUES(?,?,?,?,?)").run("cancelled_expense","u1","Старый расход",50,"2026-11-16");
  assert.throws(()=>db.prepare("INSERT INTO planned_cashflow_realizations(id,user_id,planned_cashflow_id,expense_id,amount) VALUES(?,?,?,?,?)").run("cancelled_real","u1","cancelled_plan","cancelled_expense",50),/Плановый платёж недоступен или превышен|Связь не соответствует фактической операции/);
   // Bucket spending is guarded in SQLite across expenses and both payment types.
   db.prepare("INSERT INTO income_buckets(id,user_id,title,percentage) VALUES(?,?,?,?)").run("bucket_test","u1","Тестовая корзина",100);
   db.prepare("INSERT INTO income_entries(id,user_id,amount,received_on) VALUES(?,?,?,?)").run("bucket_income","u1",100,"2026-11-20");
   db.prepare("INSERT INTO income_bucket_allocations(id,user_id,income_id,bucket_id,percentage,amount) VALUES(?,?,?,?,?,?)").run("bucket_alloc","u1","bucket_income","bucket_test",100,100);
   db.prepare("INSERT INTO debts(id,user_id,title,initial_amount,balance) VALUES(?,?,?,?,?)").run("debt_test","u1","Долг",100,100);
   db.prepare("INSERT INTO payment_obligations(id,user_id,title,amount,due_date) VALUES(?,?,?,?,?)").run("obligation_test","u1","Платёж",50,"2026-12-01");
   db.prepare("INSERT INTO obligation_payments(id,user_id,obligation_id,amount,paid_on,scheduled_due_date) VALUES(?,?,?,?,?,?)").run("obligation_once","u1","obligation_test",1,"2026-11-20","2026-12-01");
   assert.throws(()=>db.prepare("INSERT INTO obligation_payments(id,user_id,obligation_id,amount,paid_on,scheduled_due_date) VALUES(?,?,?,?,?,?)").run("obligation_twice","u1","obligation_test",1,"2026-11-20","2026-12-01"),/UNIQUE constraint failed|Период обязательства уже оплачен/);
   db.prepare("INSERT INTO expenses(id,user_id,title,amount,spent_on,bucket_id) VALUES(?,?,?,?,?,?)").run("bucket_expense","u1","Расход",60,"2026-11-20","bucket_test");
   db.prepare("INSERT INTO debt_payments(id,user_id,debt_id,amount,paid_on,bucket_id) VALUES(?,?,?,?,?,?)").run("bucket_debt_payment","u1","debt_test",30,"2026-11-20","bucket_test");
   assert.throws(()=>db.prepare("INSERT INTO obligation_payments(id,user_id,obligation_id,amount,paid_on,bucket_id) VALUES(?,?,?,?,?,?)").run("bucket_obligation_payment","u1","obligation_test",11,"2026-11-20","bucket_test"),/Недостаточно средств в корзине/);
   assert.throws(()=>db.prepare("UPDATE expenses SET amount=71 WHERE id='bucket_expense'").run(),/Недостаточно средств в корзине/);
   assert.equal(db.prepare("SELECT amount FROM expenses WHERE id='bucket_expense'").get().amount,60);
   assert.equal(db.prepare("SELECT COALESCE(SUM(amount),0) AS total FROM debt_payments WHERE user_id='u1' AND bucket_id='bucket_test'").get().total,30);
   assert.equal(db.prepare("SELECT balance FROM debts WHERE id='debt_test'").get().balance,70);
   assert.throws(()=>db.prepare("INSERT INTO debt_payments(id,user_id,debt_id,amount,paid_on) VALUES(?,?,?,?,?)").run("debt_overpay","u1","debt_test",71,"2026-11-21"),/Платёж превышает текущий остаток долга или долг уже закрыт/);

   // A recorded spend cannot be invalidated by shrinking/deleting its source allocation.
   assert.throws(()=>db.prepare("UPDATE income_bucket_allocations SET amount=89 WHERE id='bucket_alloc'").run(),/Нельзя изменить распределение|Распределение не соответствует/);
   assert.throws(()=>db.prepare("DELETE FROM income_bucket_allocations WHERE id='bucket_alloc'").run(),/Нельзя удалить распределение/);
   assert.throws(()=>db.prepare("UPDATE income_entries SET amount=99 WHERE id='bucket_income'").run(),/Сумма дохода меньше уже распределенных средств/);
   assert.throws(()=>db.prepare("DELETE FROM income_entries WHERE id='bucket_income'").run(),/Нельзя удалить распределение/);
   assert.throws(()=>db.prepare("DELETE FROM income_buckets WHERE id='bucket_test'").run(),/Нельзя удалить распределение/);
   assert.equal(db.prepare("SELECT amount FROM income_bucket_allocations WHERE id='bucket_alloc'").get().amount,100);
   assert.equal(db.prepare("SELECT amount FROM income_entries WHERE id='bucket_income'").get().amount,100);
   // Removing an expense restores only its bucket availability and reverses linked planned cashflow.
   assert.equal(db.prepare("SELECT 100 - SUM(amount) AS available FROM (SELECT amount FROM expenses WHERE user_id='u1' AND bucket_id='bucket_test' UNION ALL SELECT amount FROM debt_payments WHERE user_id='u1' AND bucket_id='bucket_test' UNION ALL SELECT amount FROM obligation_payments WHERE user_id='u1' AND bucket_id='bucket_test')").get().available,10);
   db.prepare("DELETE FROM expenses WHERE id='bucket_expense' AND user_id='u1'").run();
   assert.equal(db.prepare("SELECT 100 - SUM(amount) AS available FROM (SELECT amount FROM expenses WHERE user_id='u1' AND bucket_id='bucket_test' UNION ALL SELECT amount FROM debt_payments WHERE user_id='u1' AND bucket_id='bucket_test' UNION ALL SELECT amount FROM obligation_payments WHERE user_id='u1' AND bucket_id='bucket_test')").get().available,70);
   assert.equal(db.prepare("SELECT COUNT(*) AS count FROM expenses WHERE id='bucket_expense'").get().count,0);


  // Historical financial attribution must survive subsequent client/project renames.
  db.prepare("INSERT INTO clients(id,user_id,name,status) VALUES(?,?,?,?)").run("client1","u1","Старое имя клиента","active");
  db.prepare("UPDATE projects SET client_id=?,title=?,status=? WHERE id=? AND user_id=?").run("client1","Старое название проекта","active","project1","u1");
  db.prepare("INSERT INTO income_entries(id,user_id,amount,received_on,note,client_id,project_id,client_id_snapshot,client_name_snapshot,project_id_snapshot,project_title_snapshot) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
   .run("income_history","u1",500,"2026-11-16","", "client1","project1","client1","Старое имя клиента","project1","Старое название проекта");
  db.prepare("INSERT INTO expenses(id,user_id,title,amount,spent_on,client_id,project_id,client_id_snapshot,client_name_snapshot,project_id_snapshot,project_title_snapshot) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
   .run("expense_history","u1","Расход",100,"2026-11-16","client1","project1","client1","Старое имя клиента","project1","Старое название проекта");
  db.prepare("UPDATE clients SET name='Новое имя клиента' WHERE id='client1'").run();
  db.prepare("UPDATE projects SET title='Новое название проекта' WHERE id='project1'").run();
  const historicalIncome=db.prepare("SELECT client_name_snapshot,project_title_snapshot FROM income_entries WHERE id='income_history'").get();
  const historicalExpense=db.prepare("SELECT client_name_snapshot,project_title_snapshot FROM expenses WHERE id='expense_history'").get();
  assert.deepEqual({...historicalIncome},{client_name_snapshot:"Старое имя клиента",project_title_snapshot:"Старое название проекта"});
  assert.deepEqual({...historicalExpense},{client_name_snapshot:"Старое имя клиента",project_title_snapshot:"Старое название проекта"});

  // An active task timer blocks archiving its client/project at the SQL update boundary.
  db.prepare("INSERT INTO tasks(id,user_id,title,client_id,project_id,status) VALUES(?,?,?,?,?,?)").run("task_archive","u1","Работа","client1","project1","doing");
  db.prepare("INSERT INTO task_time_entries(id,user_id,task_id,started_at) VALUES(?,?,?,?)").run("timer_archive","u1","task_archive","2026-11-16T10:00:00Z");
  const archiveClient=db.prepare("UPDATE clients SET status='closed' WHERE id=? AND user_id=? AND NOT EXISTS (SELECT 1 FROM task_time_entries e JOIN tasks t ON t.id=e.task_id AND t.user_id=e.user_id LEFT JOIN projects p ON p.id=t.project_id AND p.user_id=t.user_id WHERE e.user_id=clients.user_id AND e.ended_at IS NULL AND (t.client_id=clients.id OR p.client_id=clients.id))").run("client1","u1");
  const archiveProject=db.prepare("UPDATE projects SET status='archived' WHERE id=? AND user_id=? AND NOT EXISTS (SELECT 1 FROM task_time_entries e JOIN tasks t ON t.id=e.task_id AND t.user_id=e.user_id WHERE e.user_id=projects.user_id AND e.ended_at IS NULL AND t.project_id=projects.id)").run("project1","u1");
  assert.equal(archiveClient.changes,0);
  assert.equal(archiveProject.changes,0);
  assert.equal(db.prepare("SELECT status FROM clients WHERE id='client1'").get().status,"active");
  assert.equal(db.prepare("SELECT status FROM projects WHERE id='project1'").get().status,"active");
  db.prepare("UPDATE task_time_entries SET ended_at='2026-11-16T10:05:00Z',duration_minutes=5 WHERE id='timer_archive'").run();
  assert.equal(db.prepare("UPDATE clients SET status='closed' WHERE id='client1'").run().changes,1);
  assert.equal(db.prepare("UPDATE projects SET status='archived' WHERE id='project1'").run().changes,1);

 }finally{db.close();}
});
