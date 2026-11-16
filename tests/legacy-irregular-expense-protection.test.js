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
 for(const name of readdirSync(join(root,"migrations")).filter(x=>/^\d+_.+\.sql$/.test(x)).sort((a,b)=>a.localeCompare(b))){
  db.exec(readFileSync(join(root,"migrations",name),"utf8"));
 }
 db.prepare("INSERT INTO users(id,email,password_hash,password_salt) VALUES(?,?,?,?)").run("u","legacy@example.test","hash","salt");
 return db;
}

test("ambiguous legacy irregular payments keep their matching expense immutable",()=>{
 const db=database();
 try{
  db.prepare("INSERT INTO irregular_expenses(id,user_id,title,category,amount,next_date,frequency) VALUES(?,?,?,?,?,?,?)").run("schedule","u","Старая страховка","Дом",12000,"2026-11-16","yearly");
  db.prepare("INSERT INTO expenses(id,user_id,category,title,amount,spent_on,note) VALUES(?,?,?,?,?,?,?)").run("legacy-expense","u","Дом","Старая страховка",12000,"2026-10-10","Оплата нерегулярного расхода");
  for(const id of ["legacy-payment-1","legacy-payment-2"]){
   db.prepare("INSERT INTO irregular_expense_payments(id,user_id,irregular_expense_id,amount,paid_on) VALUES(?,?,?,?,?)").run(id,"u","schedule",12000,"2026-10-10");
  }
  const rows=db.prepare("SELECT id,expense_id FROM irregular_expense_payments ORDER BY id").all();
  assert.deepEqual(rows.map(row=>row.expense_id),[null,null]);
  assert.throws(
   ()=>db.prepare("DELETE FROM expenses WHERE id='legacy-expense'").run(),
   /Расход по оплате нерегулярного платежа нельзя удалить/
  );
  assert.throws(
   ()=>db.prepare("UPDATE expenses SET amount=1 WHERE id='legacy-expense'").run(),
   /Расход по оплате нерегулярного платежа нельзя изменить/
  );
  assert.equal(db.prepare("SELECT COUNT(*) count FROM expenses WHERE id='legacy-expense'").get().count,1);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM irregular_expense_payments WHERE expense_id IS NULL").get().count,2);
 }finally{db.close();}
});

test("an unmatched legacy payment does not fabricate an expense row",()=>{
 const db=database();
 try{
  db.prepare("INSERT INTO irregular_expenses(id,user_id,title,category,amount,next_date,frequency) VALUES(?,?,?,?,?,?,?)").run("schedule","u","Старая страховка","Дом",12000,"2026-11-16","yearly");
  db.prepare("INSERT INTO irregular_expense_payments(id,user_id,irregular_expense_id,amount,paid_on) VALUES(?,?,?,?,?)").run("legacy-payment","u","schedule",12000,"2026-10-10");
  assert.equal(db.prepare("SELECT COUNT(*) count FROM expenses WHERE user_id='u'").get().count,0);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM irregular_expense_payments WHERE user_id='u'").get().count,1);
 }finally{db.close();}
});
