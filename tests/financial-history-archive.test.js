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
 for(const name of readdirSync(join(root,"migrations")).filter(x=>/^[0-9]+_.+\.sql$/.test(x)).sort((a,b)=>a.localeCompare(b)))db.exec(readFileSync(join(root,"migrations",name),"utf8"));
 db.prepare("INSERT INTO users(id,email,password_hash,password_salt) VALUES(?,?,?,?)").run("u","history@example.test","hash","salt");
 return db;
}

test("reserve balance changes are journaled and a reserve with history cannot be deleted",()=>{
 const db=database();
 try{
  db.prepare("INSERT INTO cash_reserves(id,user_id,title,target_amount,current_amount) VALUES(?,?,?,?,?)").run("r","u","Подушка",50000,10000);
  const opening=db.prepare("SELECT transaction_type,amount,balance_after FROM cash_reserve_transactions WHERE reserve_id='r'").get();
  assert.equal(opening.transaction_type,"opening");
  assert.equal(opening.amount,10000);
  assert.equal(opening.balance_after,10000);
  db.prepare("UPDATE cash_reserves SET current_amount=12500 WHERE id='r'").run();
  const adjustment=db.prepare("SELECT transaction_type,amount,balance_after FROM cash_reserve_transactions WHERE reserve_id='r' ORDER BY created_at DESC,id DESC LIMIT 1").get();
  assert.equal(adjustment.transaction_type,"adjustment");
  assert.equal(adjustment.amount,2500);
  assert.equal(adjustment.balance_after,12500);
  assert.throws(()=>db.prepare("DELETE FROM cash_reserves WHERE id='r'").run(),/FOREIGN KEY constraint failed/);
  assert.throws(()=>db.prepare("UPDATE cash_reserve_transactions SET amount=1 WHERE reserve_id='r'").run(),/Операцию по резерву нельзя изменить/);
  assert.throws(()=>db.prepare("DELETE FROM cash_reserve_transactions WHERE reserve_id='r'").run(),/Операцию по резерву нельзя удалить/);
  db.prepare("UPDATE cash_reserves SET active=0 WHERE id='r'").run();
  assert.equal(db.prepare("SELECT COUNT(*) count FROM cash_reserve_transactions WHERE reserve_id='r'").get().count,2);
 }finally{db.close();}
});

test("bucket archive preserves allocations and spending and rejects new allocations",()=>{
 const db=database();
 try{
  db.prepare("INSERT INTO income_buckets(id,user_id,title,percentage) VALUES(?,?,?,?)").run("b","u","Резерв",100);
  db.prepare("INSERT INTO income_entries(id,user_id,amount,received_on) VALUES(?,?,?,?)").run("i","u",100,"2026-11-16");
  db.prepare("INSERT INTO income_bucket_allocations(id,user_id,income_id,bucket_id,percentage,amount) VALUES(?,?,?,?,?,?)").run("a","u","i","b",100,100);
  db.prepare("INSERT INTO expenses(id,user_id,title,amount,spent_on,bucket_id) VALUES(?,?,?,?,?,?)").run("e","u","Покупка",40,"2026-11-16","b");
  assert.throws(()=>db.prepare("DELETE FROM income_buckets WHERE id='b'").run(),/Корзину с финансовой историей нельзя удалить/);
  db.prepare("UPDATE income_buckets SET active=0,percentage=0 WHERE id='b'").run();
  assert.equal(db.prepare("SELECT COUNT(*) count FROM income_bucket_allocations WHERE bucket_id='b'").get().count,1);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM expenses WHERE bucket_id='b'").get().count,1);
  assert.throws(()=>db.prepare("INSERT INTO income_bucket_allocations(id,user_id,income_id,bucket_id,percentage,amount) VALUES(?,?,?,?,?,?)").run("a2","u","i","b",0,0),/Нельзя распределять деньги в архивную корзину/);
 }finally{db.close();}
});
