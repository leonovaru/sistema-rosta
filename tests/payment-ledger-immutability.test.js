import test from "node:test";
import assert from "node:assert/strict";
import {readdirSync,readFileSync} from "node:fs";
import {join,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {DatabaseSync} from "node:sqlite";

const root=join(dirname(fileURLToPath(import.meta.url)),"..");

test("debt and obligation payment ledger rows cannot be rewritten or deleted",()=>{
 const db=new DatabaseSync(":memory:");
 try{
  db.exec(readFileSync(join(root,"schema.sql"),"utf8"));
  for(const name of readdirSync(join(root,"migrations")).filter(x=>/^\d+_.+\.sql$/.test(x)).sort((a,b)=>a.localeCompare(b))){
   db.exec(readFileSync(join(root,"migrations",name),"utf8"));
  }
  db.prepare("INSERT INTO users(id,email,password_hash,password_salt) VALUES(?,?,?,?)").run("u","u@example.test","hash","salt");
  db.prepare("INSERT INTO income_buckets(id,user_id,title,percentage) VALUES(?,?,?,?)").run("b","u","Долги и обязательства",100);
  db.prepare("INSERT INTO income_entries(id,user_id,amount,received_on) VALUES(?,?,?,?)").run("i","u",100,"2026-11-16");
  db.prepare("INSERT INTO income_bucket_allocations(id,user_id,income_id,bucket_id,percentage,amount) VALUES(?,?,?,?,?,?)").run("a","u","i","b",100,100);
  db.prepare("INSERT INTO debts(id,user_id,title,initial_amount,balance) VALUES(?,?,?,?,?)").run("d","u","Долг",40,40);
  db.prepare("INSERT INTO payment_obligations(id,user_id,title,amount,due_date) VALUES(?,?,?,?,?)").run("o","u","Платёж",20,"2026-12-01");
  db.prepare("INSERT INTO debt_payments(id,user_id,debt_id,amount,paid_on,bucket_id) VALUES(?,?,?,?,?,?)").run("dp","u","d",30,"2026-11-16","b");
  db.prepare("INSERT INTO obligation_payments(id,user_id,obligation_id,amount,paid_on,bucket_id,scheduled_due_date) VALUES(?,?,?,?,?,?,?)").run("op","u","o",20,"2026-11-16","b","2026-12-01");
  assert.equal(db.prepare("SELECT balance FROM debts WHERE id='d'").get().balance,10);
  assert.throws(()=>db.prepare("UPDATE debt_payments SET amount=10 WHERE id='dp'").run(),/Платёж по долгу нельзя изменить/);
  assert.throws(()=>db.prepare("DELETE FROM debt_payments WHERE id='dp'").run(),/Платёж по долгу нельзя удалить/);
  assert.throws(()=>db.prepare("UPDATE obligation_payments SET amount=10 WHERE id='op'").run(),/Платёж по обязательству нельзя изменить/);
  assert.throws(()=>db.prepare("DELETE FROM obligation_payments WHERE id='op'").run(),/Платёж по обязательству нельзя удалить/);
  assert.equal(db.prepare("SELECT balance FROM debts WHERE id='d'").get().balance,10);
 }finally{db.close();}
});
