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
  for(const name of ["trg_cashflow_realization_before_insert","trg_cashflow_realization_after_insert","trg_cashflow_realization_after_delete","trg_cashflow_income_amount_guard","trg_cashflow_expense_amount_guard"]){
   assert.ok(triggers.includes(name),`missing trigger ${name}`);
  }
  db.prepare("INSERT INTO users(id,email,password_hash,password_salt) VALUES(?,?,?,?)").run("u1","u1@example.test","hash","salt");
  db.prepare("INSERT INTO planned_cashflows(id,user_id,flow_type,title,amount,expected_date) VALUES(?,?,?,?,?,?)").run("plan1","u1","income","Этап проекта",1000,"2026-12-01");
  db.prepare("INSERT INTO income_entries(id,user_id,amount,received_on) VALUES(?,?,?,?)").run("income1","u1",600,"2026-11-16");
  db.prepare("INSERT INTO planned_cashflow_realizations(id,user_id,planned_cashflow_id,income_entry_id,amount) VALUES(?,?,?,?,?)").run("real1","u1","plan1","income1",600);
  assert.equal(db.prepare("SELECT status FROM planned_cashflows WHERE id='plan1'").get().status,"planned");
  assert.throws(()=>db.prepare("UPDATE income_entries SET amount=1200 WHERE id='income1'").run(),/Изменение суммы превысит плановый платёж/);
  db.prepare("UPDATE income_entries SET amount=1000 WHERE id='income1'").run();
  assert.equal(db.prepare("SELECT amount FROM planned_cashflow_realizations WHERE id='real1'").get().amount,1000);
  assert.equal(db.prepare("SELECT status FROM planned_cashflows WHERE id='plan1'").get().status,"realized");
  db.prepare("DELETE FROM income_entries WHERE id='income1'").run();
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM planned_cashflow_realizations WHERE id='real1'").get().count,0);
  assert.equal(db.prepare("SELECT status FROM planned_cashflows WHERE id='plan1'").get().status,"planned");
  db.prepare("INSERT INTO income_entries(id,user_id,amount,received_on) VALUES(?,?,?,?)").run("income2","u1",1200,"2026-11-17");
  assert.throws(()=>db.prepare("INSERT INTO planned_cashflow_realizations(id,user_id,planned_cashflow_id,income_entry_id,amount) VALUES(?,?,?,?,?)").run("real2","u1","plan1","income2",1200),/Плановый платёж недоступен или превышен/);
 }finally{db.close();}
});
