import test from "node:test";
import assert from "node:assert/strict";
import {readdirSync,readFileSync} from "node:fs";
import {join,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {DatabaseSync} from "node:sqlite";
const root=join(dirname(fileURLToPath(import.meta.url)),"..");
function dbWithSchema(){
 const db=new DatabaseSync(":memory:");
 db.exec(readFileSync(join(root,"schema.sql"),"utf8"));
 for(const name of readdirSync(join(root,"migrations")).filter(x=>/^\d+_.+\.sql$/.test(x)).sort((a,b)=>a.localeCompare(b)))db.exec(readFileSync(join(root,"migrations",name),"utf8"));
 db.prepare("INSERT INTO users(id,email,password_hash,password_salt) VALUES(?,?,?,?)").run("u","transfer@test.local","hash","salt");
 db.prepare("INSERT INTO income_buckets(id,user_id,title,percentage) VALUES(?,?,?,?)").run("b","u","Накопления",100);
 db.prepare("INSERT INTO income_entries(id,user_id,amount,received_on) VALUES(?,?,?,?)").run("i","u",100,"2026-11-16");
 db.prepare("INSERT INTO income_bucket_allocations(id,user_id,income_id,bucket_id,percentage,amount) VALUES(?,?,?,?,?,?)").run("a","u","i","b",100,100);
 db.prepare("INSERT INTO financial_goals(id,user_id,title,target_amount,saved_amount) VALUES(?,?,?,?,?)").run("g","u","Отпуск",1000,50);
 db.prepare("INSERT INTO cash_reserves(id,user_id,title,target_amount,current_amount) VALUES(?,?,?,?,?)").run("r","u","Подушка",500,10);
 return db;
}
test("bucket transfers fund goals/reserves without becoming expenses and can be reversed once",()=>{
 const db=dbWithSchema();
 try{
  db.prepare("INSERT INTO bucket_funding_transfers(id,user_id,source_bucket_id,target_type,target_id,amount,transferred_on,request_id) VALUES(?,?,?,?,?,?,?,?)").run("tg","u","b","goal","g",40,"2026-11-16","request-goal-0001");
  db.prepare("INSERT INTO bucket_funding_transfers(id,user_id,source_bucket_id,target_type,target_id,amount,transferred_on,request_id) VALUES(?,?,?,?,?,?,?,?)").run("tr","u","b","reserve","r",30,"2026-11-16","request-reserve-01");
  assert.equal(db.prepare("SELECT amount FROM bucket_funding_transfer_net WHERE user_id='u' AND source_bucket_id='b'").get().amount,70);
  assert.equal(db.prepare("SELECT current_amount FROM cash_reserves WHERE id='r'").get().current_amount,40);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM cash_reserve_transactions WHERE reserve_id='r' AND transaction_type='contribution'").get().count,1);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM expenses").get().count,0);
  assert.throws(()=>db.prepare("INSERT INTO expenses(id,user_id,title,amount,spent_on,bucket_id) VALUES(?,?,?,?,?,?)").run("over","u","Попытка перерасхода",31,"2026-11-16","b"),/Средства уже переведены из корзины/);
  db.prepare("INSERT INTO bucket_funding_transfer_reversals(id,user_id,transfer_id,amount,reversed_on,reason,request_id) VALUES(?,?,?,?,?,?,?)").run("rg","u","tg",40,"2026-11-17","Исправление","reverse-goal-0001");
  assert.equal(db.prepare("SELECT amount FROM bucket_funding_transfer_net WHERE user_id='u' AND source_bucket_id='b'").get().amount,30);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM bucket_funding_transfer_reversals").get().count,1);
  assert.throws(()=>db.prepare("INSERT INTO bucket_funding_transfer_reversals(id,user_id,transfer_id,amount,reversed_on,reason,request_id) VALUES(?,?,?,?,?,?,?)").run("rg2","u","tg",40,"2026-11-18","Повтор","reverse-goal-0002"),/UNIQUE constraint failed/);
  db.prepare("INSERT INTO bucket_funding_transfer_reversals(id,user_id,transfer_id,amount,reversed_on,reason,request_id) VALUES(?,?,?,?,?,?,?)").run("rr","u","tr",30,"2026-11-17","Исправление","reverse-reserve-01");
  assert.equal(db.prepare("SELECT current_amount FROM cash_reserves WHERE id='r'").get().current_amount,10);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM cash_reserve_transactions WHERE reserve_id='r'").get().count,3);
  assert.equal(db.prepare("SELECT amount FROM bucket_funding_transfer_net WHERE user_id='u' AND source_bucket_id='b'").get().amount,0);
  assert.throws(()=>db.prepare("UPDATE bucket_funding_transfers SET amount=1 WHERE id='tg'").run(),/Перевод нельзя изменить/);
  assert.throws(()=>db.prepare("DELETE FROM bucket_funding_transfers WHERE id='tg'").run(),/Перевод нельзя удалить/);
  db.prepare("INSERT INTO expenses(id,user_id,title,amount,spent_on,bucket_id) VALUES(?,?,?,?,?,?)").run("ok","u","После отмены",100,"2026-11-18","b");
  assert.equal(db.prepare("SELECT COUNT(*) count FROM expenses").get().count,1);
 }finally{db.close();}
});
test("bucket transfer database guard rejects foreign targets, archived sources and reserve overfunding",()=>{
 const db=dbWithSchema();
 try{
  db.prepare("INSERT INTO users(id,email,password_hash,password_salt) VALUES(?,?,?,?)").run("other","other@test.local","hash","salt");
  assert.throws(()=>db.prepare("INSERT INTO bucket_funding_transfers(id,user_id,source_bucket_id,target_type,target_id,amount,transferred_on,request_id) VALUES(?,?,?,?,?,?,?,?)").run("bad","u","b","goal","missing",1,"2026-11-16","request-invalid-01"),/Цель или резерв недоступны/);
  assert.throws(()=>db.prepare("INSERT INTO bucket_funding_transfers(id,user_id,source_bucket_id,target_type,target_id,amount,transferred_on,request_id) VALUES(?,?,?,?,?,?,?,?)").run("bad2","other","b","goal","g",1,"2026-11-16","request-invalid-02"),/Недостаточно средств/);
  db.prepare("UPDATE income_buckets SET active=0,percentage=0 WHERE id='b'").run();
  assert.throws(()=>db.prepare("INSERT INTO bucket_funding_transfers(id,user_id,source_bucket_id,target_type,target_id,amount,transferred_on,request_id) VALUES(?,?,?,?,?,?,?,?)").run("bad3","u","b","goal","g",1,"2026-11-16","request-invalid-03"),/Недостаточно средств/);
 }finally{db.close();}
});
