import test from "node:test";
import assert from "node:assert/strict";
import { buildProfitability } from "../functions/_lib/profitability.js";
test("profitability combines revenue, allocated expenses and completed task time by direction",()=>{
 const x=buildProfitability({incomeRows:[{direction_id:"a",direction_title:"Аудит",total:50000},{direction_id:"b",direction_title:"Таблицы",total:30000}],expenseRows:[{direction_id:"a",direction_title:"Аудит",total:5000}],taskRows:[{direction_id:"a",direction_title:"Аудит",completed_tasks:5,actual_minutes:600},{direction_id:"b",direction_title:"Таблицы",completed_tasks:3,actual_minutes:300}]});
 const a=x.directions.find(v=>v.direction_id==="a");assert.equal(a.contribution,45000);assert.equal(a.margin_percent,90);assert.equal(a.hours,10);assert.equal(a.revenue_per_hour,5000);assert.equal(a.contribution_per_hour,4500);assert.equal(x.summary.revenue,80000);assert.equal(x.summary.contribution,75000);assert.equal(x.summary.completed_tasks,8);
});
test("unallocated revenue and expenses remain visible and zero-time rates are null",()=>{
 const x=buildProfitability({incomeRows:[{direction_id:null,total:1000}],expenseRows:[{direction_id:null,total:200}],taskRows:[]});
 assert.equal(x.directions.length,1);assert.equal(x.directions[0].direction_title,"Без направления");assert.equal(x.directions[0].contribution,800);assert.equal(x.directions[0].contribution_per_hour,null);
});
test("expenses without revenue produce negative contribution, not fake margin",()=>{
 const x=buildProfitability({expenseRows:[{direction_id:"x",direction_title:"Новое направление",total:1200}]});
 assert.equal(x.directions[0].contribution,-1200);assert.equal(x.directions[0].margin_percent,null);
});
