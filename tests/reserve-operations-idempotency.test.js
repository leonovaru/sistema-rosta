import test from "node:test";
import assert from "node:assert/strict";
import {readdirSync,readFileSync} from "node:fs";
import {join,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {DatabaseSync} from "node:sqlite";
const root=join(dirname(fileURLToPath(import.meta.url)),"..");
const api=readFileSync(join(root,"functions/api/finance/reserves.js"),"utf8");
const app=readFileSync(join(root,"public/app.js"),"utf8");
function database(){
 const db=new DatabaseSync(":memory:");
 db.exec(readFileSync(join(root,"schema.sql"),"utf8"));
 for(const name of readdirSync(join(root,"migrations")).filter(x=>/^\\d+_.+\\.sql$/.test(x)).sort((a,b)=>a.localeCompare(b)))db.exec(readFileSync(join(root,"migrations",name),"utf8"));
 db.prepare("INSERT INTO users(id,email,password_hash,password_salt) VALUES(?,?,?,?)").run("u","reserve-idempotency@example.test","hash","salt");
 db.prepare("INSERT INTO cash_reserves(id,user_id,title,target_amount,current_amount) VALUES(?,?,?,?,?)").run("r","u","Резерв",500,100);
 return db;
}
test("manual reserve operations require and validate an idempotency key",()=>{
 assert.ok(api.includes('!/^[a-zA-Z0-9_-]{16,100}$/.test(requestId)'));
 assert.ok(api.includes("SELECT id,reserve_id,transaction_type,amount,note FROM cash_reserve_transactions WHERE user_id=? AND request_id=?"));
 assert.ok(api.includes("prior.reserve_id!==id||prior.transaction_type!==transactionType||Math.abs(Number(prior.amount)-amount)>0.0001||String(prior.note||\"\")!==note"));
 assert.ok(api.includes("request_id) SELECT ?,?,?,?,?,?,?,? WHERE changes()=1"));
 assert.ok(app.includes('request_id:operation.dataset.requestId'));
 assert.ok(app.includes('operation.dataset.requestAmount!==String(amount)'));
});
test("reserve ledger enforces unique request IDs while keeping legacy rows nullable",()=>{
 const db=database();try{
  const columns=db.prepare("PRAGMA table_info(cash_reserve_transactions)").all();
  assert.ok(columns.some(x=>x.name==="request_id"&&x.notnull===0));
  db.prepare("INSERT INTO cash_reserve_transactions(id,user_id,reserve_id,transaction_type,amount,balance_after,note,request_id) VALUES(?,?,?,?,?,?,?,?)").run("t1","u","r","contribution",25,125,"Пополнение","reserve-request-0001");
  assert.throws(()=>db.prepare("INSERT INTO cash_reserve_transactions(id,user_id,reserve_id,transaction_type,amount,balance_after,note,request_id) VALUES(?,?,?,?,?,?,?,?)").run("t2","u","r","contribution",25,150,"Пополнение","reserve-request-0001"),/UNIQUE constraint failed/);
  db.prepare("INSERT INTO cash_reserve_transactions(id,user_id,reserve_id,transaction_type,amount,balance_after,note) VALUES(?,?,?,?,?,?,?)").run("legacy","u","r","adjustment",5,130,"Старая запись");
  assert.equal(db.prepare("SELECT COUNT(*) count FROM cash_reserve_transactions WHERE request_id='reserve-request-0001'").get().count,1);
 }finally{db.close();}
});
