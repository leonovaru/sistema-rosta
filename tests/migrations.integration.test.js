import test from "node:test";
import assert from "node:assert/strict";
import {readdirSync,readFileSync} from "node:fs";
import {join,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {DatabaseSync} from "node:sqlite";

const root=join(dirname(fileURLToPath(import.meta.url)),"..");

test("base schema and every ordered D1 migration apply to a clean SQLite database",()=>{
 const db=new DatabaseSync(":memory:");
 try{
  db.exec(readFileSync(join(root,"schema.sql"),"utf8"));
  const migrations=readdirSync(join(root,"migrations"))
   .filter(name=>/^\\d+_.+\\.sql$/.test(name))
   .sort((a,b)=>a.localeCompare(b));
  assert.ok(migrations.length>=50,"expected the complete migration history");
  for(const name of migrations){
   try{db.exec(readFileSync(join(root,"migrations",name),"utf8"));}
   catch(error){throw new Error(`Migration ${name} failed: ${error.message}`);}
  }
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row=>row.name);
  for(const name of ["task_time_entries","daily_task_allocations","daily_block_logs","planned_cashflow_realizations","planned_cashflows","clients","projects","deals"]){
   assert.ok(tables.includes(name),`missing table ${name}`);
  }
  const triggers=db.prepare("SELECT name FROM sqlite_master WHERE type='trigger'").all().map(row=>row.name);
  for(const name of ["trg_cashflow_realization_before_insert","trg_cashflow_realization_after_insert","trg_cashflow_realization_after_delete","trg_cashflow_income_amount_guard","trg_cashflow_expense_amount_guard"]){
   assert.ok(triggers.includes(name),`missing trigger ${name}`);
  }
 }finally{db.close();}
});
