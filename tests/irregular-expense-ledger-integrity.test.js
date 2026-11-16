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
 db.prepare("INSERT INTO users(id,email,password_hash,password_salt) VALUES(?,?,?,?)").run("u","irregular@example.test","hash","salt");
 return db;
}

test("paid irregular expense schedules are archived and their payment ledger is immutable",()=>{
 const db=database();
 try{
  db.prepare("INSERT INTO irregular_expenses(id,user_id,title,category,amount,next_date,frequency) VALUES(?,?,?,?,?,?,?)").run("x","u","Страховка","Дом",12000,"2026-11-16","yearly");
  db.prepare("INSERT INTO irregular_expense_payments(id,user_id,irregular_expense_id,amount,paid_on) VALUES(?,?,?,?,?)").run("p","u","x",12000,"2026-11-16");
  assert.throws(()=>db.prepare("DELETE FROM irregular_expenses WHERE id='x'").run(),/Оплату нерегулярного расхода нельзя удалить/);
  assert.throws(()=>db.prepare("UPDATE irregular_expense_payments SET amount=1 WHERE id='p'").run(),/Оплату нерегулярного расхода нельзя изменить/);
  assert.throws(()=>db.prepare("DELETE FROM irregular_expense_payments WHERE id='p'").run(),/Оплату нерегулярного расхода нельзя удалить/);
  db.prepare("UPDATE irregular_expenses SET active=0 WHERE id='x'").run();
  assert.equal(db.prepare("SELECT active FROM irregular_expenses WHERE id='x'").get().active,0);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM irregular_expense_payments WHERE irregular_expense_id='x'").get().count,1);
 }finally{db.close();}
});

test("an irregular expense without payments can still be deleted",()=>{
 const db=database();
 try{
  db.prepare("INSERT INTO irregular_expenses(id,user_id,title,category,amount,next_date,frequency) VALUES(?,?,?,?,?,?,?)").run("x","u","Разовая покупка","Прочее",500,"2026-11-16","once");
  db.prepare("DELETE FROM irregular_expenses WHERE id='x'").run();
  assert.equal(db.prepare("SELECT COUNT(*) count FROM irregular_expenses WHERE id='x'").get().count,0);
 }finally{db.close();}
});

test("an irregular payment stays linked to its single expense fact",()=>{
 const db=database();
 try{
  db.prepare("INSERT INTO irregular_expenses(id,user_id,title,category,amount,next_date,frequency) VALUES(?,?,?,?,?,?,?)").run("x","u","Страховка","Дом",12000,"2026-11-16","yearly");
  db.prepare("INSERT INTO expenses(id,user_id,category,title,amount,spent_on,note) VALUES(?,?,?,?,?,?,?)").run("e","u","Дом","Страховка",12000,"2026-11-16","Оплата нерегулярного расхода");
  db.prepare("INSERT INTO irregular_expense_payments(id,user_id,irregular_expense_id,amount,paid_on,expense_id) VALUES(?,?,?,?,?,?)").run("p","u","x",12000,"2026-11-16","e");
  assert.equal(db.prepare("SELECT COALESCE(SUM(amount),0) total FROM expenses WHERE user_id='u'").get().total,12000);
  assert.equal(db.prepare("SELECT COALESCE(SUM(amount),0) total FROM irregular_expense_payments WHERE user_id='u'").get().total,12000);
  assert.throws(()=>db.prepare("DELETE FROM expenses WHERE id='e'").run(),/Расход по оплате нерегулярного платежа нельзя удалить/);
  assert.throws(()=>db.prepare("UPDATE expenses SET amount=1 WHERE id='e'").run(),/Расход по оплате нерегулярного платежа нельзя изменить/);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM expenses WHERE id='e'").get().count,1);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM irregular_expense_payments WHERE expense_id='e'").get().count,1);
 }finally{db.close();}
});
