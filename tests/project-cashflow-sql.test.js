import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";

const migration=(name)=>readFileSync(new URL(`../migrations/${name}`,import.meta.url),"utf8");

function createDb(){
 const db=new DatabaseSync(":memory:");
 db.exec(`
  PRAGMA foreign_keys=ON;
  CREATE TABLE users(id TEXT PRIMARY KEY);
  CREATE TABLE planned_cashflows(
   id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
   project_id TEXT,flow_type TEXT NOT NULL,amount REAL NOT NULL,status TEXT NOT NULL DEFAULT 'planned',
   archived_at TEXT
  );
  CREATE TABLE income_entries(
   id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
   project_id TEXT,project_id_snapshot TEXT,amount REAL NOT NULL
  );
  CREATE TABLE expenses(
   id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
   project_id TEXT,project_id_snapshot TEXT,amount REAL NOT NULL
  );
 `);
 db.exec(migration("0049_project_cashflow_realizations.sql"));
 db.exec(migration("0050_cashflow_realization_reconciliation.sql"));
 db.prepare("INSERT INTO users(id) VALUES(?)").run("u1");
 return db;
}

function seedPlan(db,{id="p1",flowType="income",amount=100,status="planned"}={}){
 db.prepare("INSERT INTO planned_cashflows(id,user_id,project_id,flow_type,amount,status) VALUES(?,?,?,?,?,?)")
  .run(id,"u1","project-1",flowType,amount,status);
}

function seedIncome(db,id,amount){
 db.prepare("INSERT INTO income_entries(id,user_id,project_id,amount) VALUES(?,?,?,?)")
  .run(id,"u1","project-1",amount);
}
function seedExpense(db,id,amount){
 db.prepare("INSERT INTO expenses(id,user_id,project_id,amount) VALUES(?,?,?,?)")
  .run(id,"u1","project-1",amount);
}
function link(db,{id,planId="p1",incomeId=null,expenseId=null,amount}){
 db.prepare("INSERT INTO planned_cashflow_realizations(id,user_id,planned_cashflow_id,income_entry_id,expense_id,amount) VALUES(?,?,?,?,?,?)")
  .run(id,"u1",planId,incomeId,expenseId,amount);
}
function planStatus(db,id="p1"){
 return db.prepare("SELECT status FROM planned_cashflows WHERE id=?").get(id).status;
}
function linkedAmount(db,operationId,column="income_entry_id"){
 return db.prepare(`SELECT amount FROM planned_cashflow_realizations WHERE ${column}=?`).get(operationId)?.amount;
}

test("SQL migration reopens a realized plan when a linked income is deleted",()=>{
 const db=createDb();
 try{
  seedPlan(db);seedIncome(db,"i1",100);link(db,{id:"r1",incomeId:"i1",amount:100});
  db.prepare("UPDATE planned_cashflows SET status='realized' WHERE id='p1'").run();
  db.prepare("DELETE FROM income_entries WHERE id='i1'").run();
  assert.equal(planStatus(db),"planned");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM planned_cashflow_realizations").get().n,0);
 }finally{db.close();}
});

test("SQL migration preserves cancelled status when a linked fact is deleted",()=>{
 const db=createDb();
 try{
  seedPlan(db,{status:"cancelled"});seedIncome(db,"i1",100);link(db,{id:"r1",incomeId:"i1",amount:100});
  db.prepare("DELETE FROM income_entries WHERE id='i1'").run();
  assert.equal(planStatus(db),"cancelled");
 }finally{db.close();}
});

test("SQL triggers synchronize linked income amounts and reject plan overflow",()=>{
 const db=createDb();
 try{
  seedPlan(db);seedIncome(db,"i1",40);seedIncome(db,"i2",60);
  link(db,{id:"r1",incomeId:"i1",amount:40});link(db,{id:"r2",incomeId:"i2",amount:60});
  db.prepare("UPDATE planned_cashflows SET status='realized' WHERE id='p1'").run();
  assert.throws(()=>db.prepare("UPDATE income_entries SET amount=61 WHERE id='i2'").run(),/Изменение суммы превысит плановый платёж/);
  db.prepare("UPDATE income_entries SET amount=50 WHERE id='i2'").run();
  assert.equal(linkedAmount(db,"i2"),50);
  assert.equal(planStatus(db),"planned");
 }finally{db.close();}
});

test("SQL triggers synchronize linked expense amounts and reject plan overflow",()=>{
 const db=createDb();
 try{
  seedPlan(db,{flowType:"expense"});seedExpense(db,"e1",100);
  link(db,{id:"r1",expenseId:"e1",amount:100});
  db.prepare("UPDATE planned_cashflows SET status='realized' WHERE id='p1'").run();
  assert.throws(()=>db.prepare("UPDATE expenses SET amount=101 WHERE id='e1'").run(),/Изменение суммы превысит плановый платёж/);
  db.prepare("UPDATE expenses SET amount=80 WHERE id='e1'").run();
  assert.equal(linkedAmount(db,"e1","expense_id"),80);
  assert.equal(planStatus(db),"planned");
 }finally{db.close();}
});

test("SQL trigger recalculates plan status when a realization is edited",()=>{
 const db=createDb();
 try{
  seedPlan(db);seedIncome(db,"i1",100);link(db,{id:"r1",incomeId:"i1",amount:100});
  db.prepare("UPDATE planned_cashflows SET status='realized' WHERE id='p1'").run();
  db.prepare("UPDATE planned_cashflow_realizations SET amount=50 WHERE id='r1'").run();
  assert.equal(planStatus(db),"planned");
 }finally{db.close();}
});
