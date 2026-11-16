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
 db.prepare("INSERT INTO users(id,email,password_hash,password_salt) VALUES(?,?,?,?)").run("u","reversal@example.test","hash","salt");
 return db;
}
function setupPaid(db,{bucket=true}={}){
 db.prepare("INSERT INTO irregular_expenses(id,user_id,title,category,amount,next_date,frequency) VALUES(?,?,?,?,?,?,?)").run("x","u","Страховка","Дом",60,"2026-11-10","yearly");
 if(bucket){
  db.prepare("INSERT INTO income_buckets(id,user_id,title,percentage) VALUES(?,?,?,?)").run("b","u","Дом",100);
  db.prepare("INSERT INTO income_entries(id,user_id,amount,received_on,title) VALUES(?,?,?,?,?)").run("i","u",100,"2026-11-01","Доход");
  db.prepare("INSERT INTO income_bucket_allocations(id,user_id,income_id,bucket_id,percentage,amount) VALUES(?,?,?,?,?,?)").run("a","u","i","b",100,100);
 }
 db.prepare("INSERT INTO expenses(id,user_id,category,title,amount,spent_on,note,bucket_id) VALUES(?,?,?,?,?,?,?,?)").run("e","u","Дом","Страховка",60,"2026-11-10","Оплата нерегулярного расхода",bucket?"b":null);
 db.prepare("INSERT INTO irregular_expense_payments(id,user_id,irregular_expense_id,amount,paid_on,expense_id,scheduled_due_date,request_id) VALUES(?,?,?,?,?,?,?,?)").run("p","u","x",60,"2026-11-10","e","2026-11-10","payment-request-0001");
}
test("irregular payment reversal is immutable, amount-matched and reopens only its occurrence",()=>{
 const db=database();try{
  setupPaid(db);
  db.prepare("INSERT INTO irregular_expense_payment_reversals(id,user_id,irregular_expense_payment_id,expense_id,amount,reversed_on,reason,request_id) VALUES(?,?,?,?,?,?,?,?)").run("r","u","p","e",60,"2026-11-12","Ошибочная отметка оплаты","reverse-request-0001");
  assert.equal(db.prepare("SELECT amount FROM irregular_expense_payment_bucket_net WHERE user_id='u' AND bucket_id='b'").get().amount,0);
  assert.equal(db.prepare("SELECT status FROM irregular_expense_payment_occurrences WHERE irregular_expense_id='x' AND scheduled_due_date='2026-11-10'").get().status,"unpaid");
  assert.throws(()=>db.prepare("UPDATE irregular_expense_payment_reversals SET reason='изменено'").run(),/неизменяем/);
  assert.throws(()=>db.prepare("DELETE FROM irregular_expense_payment_reversals").run(),/неизменяем/);
  assert.throws(()=>db.prepare("INSERT INTO irregular_expense_payment_reversals(id,user_id,irregular_expense_payment_id,expense_id,amount,reversed_on,reason,request_id) VALUES(?,?,?,?,?,?,?,?)").run("r2","u","p","e",60,"2026-11-13","Повторная отмена","reverse-request-0002"),/UNIQUE constraint failed/);
 }finally{db.close();}
});
test("reversing an irregular expense payment releases bucket capacity for a new expense",()=>{
 const db=database();try{
  setupPaid(db);
  db.prepare("INSERT INTO irregular_expense_payment_reversals(id,user_id,irregular_expense_payment_id,expense_id,amount,reversed_on,reason,request_id) VALUES(?,?,?,?,?,?,?,?)").run("r","u","p","e",60,"2026-11-12","Ошибочная отметка оплаты","reverse-request-0001");
  assert.doesNotThrow(()=>db.prepare("INSERT INTO expenses(id,user_id,category,title,amount,spent_on,bucket_id) VALUES(?,?,?,?,?,?,?)").run("e2","u","Прочее","Новая покупка",60,"2026-11-13","b"));
 }finally{db.close();}
});
test("a reversed scheduled occurrence can be paid again without erasing its original ledger fact",()=>{
 const db=database();try{
  setupPaid(db,{bucket:false});
  db.prepare("INSERT INTO irregular_expense_payment_reversals(id,user_id,irregular_expense_payment_id,expense_id,amount,reversed_on,reason,request_id) VALUES(?,?,?,?,?,?,?,?)").run("r","u","p","e",60,"2026-11-12","Ошибочная отметка оплаты","reverse-request-0001");
  db.prepare("INSERT INTO expenses(id,user_id,category,title,amount,spent_on,note) VALUES(?,?,?,?,?,?,?)").run("e2","u","Дом","Страховка",60,"2026-11-13","Оплата нерегулярного расхода");
  db.prepare("INSERT INTO irregular_expense_payments(id,user_id,irregular_expense_id,amount,paid_on,expense_id,scheduled_due_date,request_id) VALUES(?,?,?,?,?,?,?,?)").run("p2","u","x",60,"2026-11-13","e2","2026-11-10","payment-request-0002");
  assert.equal(db.prepare("SELECT status FROM irregular_expense_payment_occurrences WHERE irregular_expense_id='x' AND scheduled_due_date='2026-11-10'").get().status,"paid");
  assert.equal(db.prepare("SELECT COUNT(*) count FROM irregular_expense_payments WHERE irregular_expense_id='x'").get().count,2);
 }finally{db.close();}
});
test("legacy irregular payments without an unambiguous expense link or scheduled date cannot be reversed",()=>{
 const db=database();try{
  db.prepare("INSERT INTO irregular_expenses(id,user_id,title,category,amount,next_date,frequency) VALUES(?,?,?,?,?,?,?)").run("x","u","Старый расход","Дом",60,"2026-11-10","once");
  db.prepare("INSERT INTO irregular_expense_payments(id,user_id,irregular_expense_id,amount,paid_on) VALUES(?,?,?,?,?)").run("legacy","u","x",60,"2026-11-10");
  assert.throws(()=>db.prepare("INSERT INTO irregular_expense_payment_reversals(id,user_id,irregular_expense_payment_id,expense_id,amount,reversed_on,reason,request_id) VALUES(?,?,?,?,?,?,?,?)").run("r","u","legacy","e",60,"2026-11-12","Старая оплата","reverse-request-0001"),/Нельзя отменить оплату/);
 }finally{db.close();}
});
