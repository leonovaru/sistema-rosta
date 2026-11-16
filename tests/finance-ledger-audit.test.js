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
 assert.equal(queries.length,6);
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
