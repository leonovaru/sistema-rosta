import test from "node:test";
import assert from "node:assert/strict";
import {readdirSync,readFileSync} from "node:fs";
import {join,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {DatabaseSync} from "node:sqlite";
const root=join(dirname(fileURLToPath(import.meta.url)),"..");
const incomeApi=readFileSync(join(root,"functions/api/income.js"),"utf8");
const financeApi=readFileSync(join(root,"functions/api/finance.js"),"utf8");
const app=readFileSync(join(root,"public/app.js"),"utf8");
function database(){
 const db=new DatabaseSync(":memory:");db.exec(readFileSync(join(root,"schema.sql"),"utf8"));
 for(const name of readdirSync(join(root,"migrations")).filter(x=>/^\d+_.+\.sql$/.test(x)).sort((a,b)=>a.localeCompare(b)))db.exec(readFileSync(join(root,"migrations",name),"utf8"));
 db.prepare("INSERT INTO users(id,email,password_hash,password_salt) VALUES(?,?,?,?)").run("u","finance-create-idempotency@example.test","hash","salt");
 return db;
}
test("income and ordinary expense create endpoints require stable request IDs and compare complete payloads",()=>{
 assert.ok(incomeApi.includes("income_entries WHERE user_id=? AND request_id=?"));
 assert.ok(incomeApi.includes("row.received_on===date")&&incomeApi.includes("row.client_id===(clientId||null)")&&incomeApi.includes("row.project_id===(projectId||null)"));
 assert.ok(financeApi.includes("expenses WHERE user_id=? AND request_id=?"));
 assert.ok(financeApi.includes("row.spent_on===date")&&financeApi.includes("row.bucket_id===(bucketId||null)")&&financeApi.includes("row.client_id===(clientId||null)"));
 assert.ok(app.includes("request_id:incomeRequestId")&&app.includes("request_id:expenseRequestId"));
});
test("income and expense ledgers enforce unique request IDs without constraining legacy rows",()=>{
 const db=database();try{
  const incomeColumns=db.prepare("PRAGMA table_info(income_entries)").all();
  const expenseColumns=db.prepare("PRAGMA table_info(expenses)").all();
  assert.ok(incomeColumns.some(x=>x.name==="request_id"&&x.notnull===0));
  assert.ok(expenseColumns.some(x=>x.name==="request_id"&&x.notnull===0));
  db.prepare("INSERT INTO income_entries(id,user_id,amount,received_on,request_id) VALUES(?,?,?,?,?)").run("i1","u",100,"2026-11-01","income-request-0001");
  assert.throws(()=>db.prepare("INSERT INTO income_entries(id,user_id,amount,received_on,request_id) VALUES(?,?,?,?,?)").run("i2","u",100,"2026-11-01","income-request-0001"),/UNIQUE constraint failed/);
  db.prepare("INSERT INTO expenses(id,user_id,title,amount,spent_on,request_id) VALUES(?,?,?,?,?,?)").run("e1","u","Покупка",25,"2026-11-02","expense-request-0001");
  assert.throws(()=>db.prepare("INSERT INTO expenses(id,user_id,title,amount,spent_on,request_id) VALUES(?,?,?,?,?,?)").run("e2","u","Покупка",25,"2026-11-02","expense-request-0001"),/UNIQUE constraint failed/);
  db.prepare("INSERT INTO expenses(id,user_id,title,amount,spent_on) VALUES(?,?,?,?,?)").run("legacy","u","Старая запись",5,"2026-11-03");
  assert.equal(db.prepare("SELECT COUNT(*) count FROM expenses WHERE request_id IS NULL").get().count,1);
 }finally{db.close();}
});
