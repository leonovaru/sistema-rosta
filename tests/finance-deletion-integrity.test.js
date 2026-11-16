import test from "node:test";
import assert from "node:assert/strict";
import {readdirSync,readFileSync} from "node:fs";
import {join,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {DatabaseSync} from "node:sqlite";

const root=join(dirname(fileURLToPath(import.meta.url)),"..");

function database(){
 const db=new DatabaseSync(":memory:");
 db.exec(readFileSync(join(root,"schema.sql"),"utf8"));
 for(const name of readdirSync(join(root,"migrations")).filter(x=>/^[0-9]+_.+\.sql$/.test(x)).sort((a,b)=>a.localeCompare(b))){
  db.exec(readFileSync(join(root,"migrations",name),"utf8"));
 }
 db.prepare("INSERT INTO users(id,email,password_hash,password_salt) VALUES(?,?,?,?)").run("u","finance@example.test","hash","salt");
 return db;
}

test("deleting an expense restores bucket availability and updates monthly finance totals",()=>{
 const db=database();
 try{
  db.prepare("INSERT INTO income_buckets(id,user_id,title,percentage) VALUES(?,?,?,?)").run("b","u","Жильё",100);
  db.prepare("INSERT INTO income_entries(id,user_id,amount,received_on) VALUES(?,?,?,?)").run("i","u",100,"2026-11-16");
  db.prepare("INSERT INTO income_bucket_allocations(id,user_id,income_id,bucket_id,percentage,amount) VALUES(?,?,?,?,?,?)").run("a","u","i","b",100,100);
  db.prepare("INSERT INTO expenses(id,user_id,title,amount,spent_on,bucket_id) VALUES(?,?,?,?,?,?)").run("e","u","Аренда",40,"2026-11-16","b");
  const before=db.prepare("SELECT (SELECT COALESCE(SUM(amount),0) FROM expenses WHERE user_id='u' AND spent_on BETWEEN '2026-11-01' AND '2026-11-30') expenses,(SELECT COALESCE(SUM(a.amount),0)-COALESCE((SELECT SUM(amount) FROM expenses WHERE user_id='u' AND bucket_id='b'),0) FROM income_bucket_allocations a WHERE a.user_id='u' AND a.bucket_id='b') available").get();
  assert.equal(before.expenses,40);
  assert.equal(before.available,60);
  db.prepare("DELETE FROM expenses WHERE id='e' AND user_id='u'").run();
  const after=db.prepare("SELECT (SELECT COALESCE(SUM(amount),0) FROM expenses WHERE user_id='u' AND spent_on BETWEEN '2026-11-01' AND '2026-11-30') expenses,(SELECT COALESCE(SUM(a.amount),0)-COALESCE((SELECT SUM(amount) FROM expenses WHERE user_id='u' AND bucket_id='b'),0) FROM income_bucket_allocations a WHERE a.user_id='u' AND a.bucket_id='b') available").get();
  assert.equal(after.expenses,0);
  assert.equal(after.available,100);
 }finally{db.close();}
});

test("an unspent income entry can be removed with its allocations, but spent funding cannot be erased",()=>{
 const db=database();
 try{
  db.prepare("INSERT INTO income_buckets(id,user_id,title,percentage) VALUES(?,?,?,?)").run("b","u","Свободные расходы",100);
  db.prepare("INSERT INTO income_entries(id,user_id,amount,received_on) VALUES(?,?,?,?)").run("i1","u",100,"2026-11-16");
  db.prepare("INSERT INTO income_bucket_allocations(id,user_id,income_id,bucket_id,percentage,amount) VALUES(?,?,?,?,?,?)").run("a1","u","i1","b",100,100);
  db.prepare("DELETE FROM income_entries WHERE id='i1' AND user_id='u'").run();
  assert.equal(db.prepare("SELECT COUNT(*) count FROM income_bucket_allocations WHERE income_id='i1'").get().count,0);
  assert.equal(db.prepare("SELECT COALESCE(SUM(amount),0) total FROM income_entries WHERE user_id='u'").get().total,0);

  db.prepare("INSERT INTO income_entries(id,user_id,amount,received_on) VALUES(?,?,?,?)").run("i2","u",100,"2026-11-17");
  db.prepare("INSERT INTO income_bucket_allocations(id,user_id,income_id,bucket_id,percentage,amount) VALUES(?,?,?,?,?,?)").run("a2","u","i2","b",100,100);
  db.prepare("INSERT INTO expenses(id,user_id,title,amount,spent_on,bucket_id) VALUES(?,?,?,?,?,?)").run("e2","u","Покупка",25,"2026-11-17","b");
  assert.throws(()=>db.prepare("DELETE FROM income_entries WHERE id='i2' AND user_id='u'").run(),/Нельзя удалить распределение/);
  assert.equal(db.prepare("SELECT amount FROM income_entries WHERE id='i2'").get().amount,100);
  assert.equal(db.prepare("SELECT amount FROM income_bucket_allocations WHERE id='a2'").get().amount,100);
 }finally{db.close();}
});

test("income can be deleted when other bucket allocations still cover recorded spending",()=>{
 const db=database();
 try{
  db.prepare("INSERT INTO income_buckets(id,user_id,title,percentage) VALUES(?,?,?,?)").run("b","u","Свободные расходы",100);
  for(const [incomeId,allocationId] of [["i1","a1"],["i2","a2"]]){
   db.prepare("INSERT INTO income_entries(id,user_id,amount,received_on) VALUES(?,?,?,?)").run(incomeId,"u",100,"2026-11-18");
   db.prepare("INSERT INTO income_bucket_allocations(id,user_id,income_id,bucket_id,percentage,amount) VALUES(?,?,?,?,?,?)").run(allocationId,"u",incomeId,"b",100,100);
  }
  db.prepare("INSERT INTO expenses(id,user_id,title,amount,spent_on,bucket_id) VALUES(?,?,?,?,?,?)").run("e","u","Покупка",75,"2026-11-18","b");
  db.prepare("DELETE FROM income_entries WHERE id='i1' AND user_id='u'").run();
  assert.equal(db.prepare("SELECT COUNT(*) count FROM income_entries WHERE id='i1'").get().count,0);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM income_bucket_allocations WHERE income_id='i1'").get().count,0);
  assert.equal(db.prepare("SELECT COALESCE(SUM(amount),0) total FROM income_entries WHERE user_id='u'").get().total,100);
  assert.equal(db.prepare("SELECT COALESCE(SUM(amount),0)-75 balance FROM income_bucket_allocations WHERE bucket_id='b'").get().balance,25);
 }finally{db.close();}
});

test("income deletion is rejected when historical debt or obligation payments would become unfunded",()=>{
 for(const table of ["debt_payments","obligation_payments"]){
  const db=database();
  try{
   db.prepare("INSERT INTO income_buckets(id,user_id,title,percentage) VALUES(?,?,?,?)").run("b","u","Долги и обязательства",100);
   db.prepare("INSERT INTO income_entries(id,user_id,amount,received_on) VALUES(?,?,?,?)").run("i","u",100,"2026-11-19");
   db.prepare("INSERT INTO income_bucket_allocations(id,user_id,income_id,bucket_id,percentage,amount) VALUES(?,?,?,?,?,?)").run("a","u","i","b",100,100);
   if(table==="debt_payments"){
    db.prepare("INSERT INTO debts(id,user_id,title,initial_amount,balance) VALUES(?,?,?,?,?)").run("d","u","Долг",50,25);
    db.prepare("INSERT INTO debt_payments(id,user_id,debt_id,amount,paid_on,bucket_id) VALUES(?,?,?,?,?,?)").run("p","u","d",25,"2026-11-19","b");
   }else{
    db.prepare("INSERT INTO payment_obligations(id,user_id,title,amount,due_date,active) VALUES(?,?,?,?,?,1)").run("o","u","Обязательство",25,"2026-11-19");
    db.prepare("INSERT INTO obligation_payments(id,user_id,obligation_id,amount,paid_on,bucket_id) VALUES(?,?,?,?,?,?)").run("p","u","o",25,"2026-11-19","b");
   }
   assert.throws(()=>db.prepare("DELETE FROM income_entries WHERE id='i' AND user_id='u'").run(),/Нельзя удалить распределение/);
   assert.equal(db.prepare("SELECT COUNT(*) count FROM income_entries WHERE id='i'").get().count,1);
   assert.equal(db.prepare("SELECT COUNT(*) count FROM income_bucket_allocations WHERE income_id='i'").get().count,1);
  }finally{db.close();}
 }
});
