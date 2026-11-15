import test from "node:test";
import assert from "node:assert/strict";
import { buildProfitability, attachObservedSalesMetrics, buildCompletedTaskResiduals } from "../functions/_lib/profitability.js";
test("profitability combines revenue, allocated expenses and completed task time by direction",()=>{
 const x=buildProfitability({incomeRows:[{direction_id:"a",direction_title:"Аудит",total:50000},{direction_id:"b",direction_title:"Таблицы",total:30000}],expenseRows:[{direction_id:"a",direction_title:"Аудит",total:5000}],taskRows:[{direction_id:"a",direction_title:"Аудит",completed_tasks:5,actual_minutes:600},{direction_id:"b",direction_title:"Таблицы",completed_tasks:3,actual_minutes:300}]});
 const a=x.directions.find(v=>v.direction_id==="a");assert.equal(a.contribution,45000);assert.equal(a.margin_percent,90);assert.equal(a.hours,10);assert.equal(a.revenue_per_hour,5000);assert.equal(a.contribution_per_hour,4500);assert.equal(a.share_percent,62.5);assert.equal(x.summary.revenue,80000);assert.equal(x.summary.contribution,75000);assert.equal(x.summary.completed_tasks,8);
});
test("unfinished task timer time is included without counting it as completed work",()=>{
 const x=buildProfitability({incomeRows:[{direction_id:"a",total:12000}],openTaskRows:[{direction_id:"a",active_tasks:2,tracked_minutes:90}]});
 const a=x.directions[0];assert.equal(a.completed_tasks,0);assert.equal(a.active_tasks,2);assert.equal(a.tracked_minutes,90);assert.equal(a.hours,1.5);assert.equal(a.revenue_per_hour,8000);
});
test("unallocated revenue and expenses remain visible and zero-time rates are null",()=>{
 const x=buildProfitability({incomeRows:[{direction_id:null,total:1000}],expenseRows:[{direction_id:null,total:200}]});
 assert.equal(x.directions.length,1);assert.equal(x.directions[0].direction_title,"Без направления");assert.equal(x.directions[0].contribution,800);assert.equal(x.directions[0].contribution_per_hour,null);
});
test("expenses without revenue produce negative contribution, not fake margin",()=>{
 const x=buildProfitability({expenseRows:[{direction_id:"x",direction_title:"Новое направление",total:1200}]});
 assert.equal(x.directions[0].contribution,-1200);assert.equal(x.directions[0].margin_percent,null);
});

test("profitability directions include observed sales conversion and cycle with sample sizes",()=>{
 const base=buildProfitability({incomeRows:[{direction_id:"a",direction_title:"Аудит",total:10000}]}).directions;
 const enriched=attachObservedSalesMetrics(base,[{direction_id:"a",observed_contacted_clients:10,qualified_clients:4,won_clients:2,observed_contact_to_lead_percent:40,observed_lead_to_sale_percent:50,avg_contact_to_won_days:18.5,contact_to_won_sample:2}]);
 assert.equal(enriched[0].revenue,10000);
 assert.equal(enriched[0].observed_contacted_clients,10);
 assert.equal(enriched[0].observed_contact_to_lead_percent,40);
 assert.equal(enriched[0].avg_contact_to_won_days,18.5);
 assert.equal(enriched[0].contact_to_won_sample,2);
});
test("missing sales history stays explicitly unavailable",()=>{
 const base=buildProfitability({incomeRows:[{direction_id:"a",total:1000}]}).directions;
 const enriched=attachObservedSalesMetrics(base,[]);
 assert.equal(enriched[0].observed_contact_to_lead_percent,null);
 assert.equal(enriched[0].avg_contact_to_won_days,null);
 assert.equal(enriched[0].observed_contacted_clients,0);
});

test("completed task time excludes timer sessions already attributed to their historical direction",()=>{
 const rows=buildCompletedTaskResiduals([
  {id:"task-1",direction_id:"new",direction_title:"Новое направление",actual_minutes:240},
  {id:"task-2",direction_id:null,direction_title:"Без направления",actual_minutes:30}
 ],[
  {task_id:"task-1",tracked_minutes:180},
  {task_id:"task-2",tracked_minutes:45}
 ]);
 assert.deepEqual(rows,[
  {direction_id:"new",direction_title:"Новое направление",completed_tasks:1,actual_minutes:60},
  {direction_id:null,direction_title:"Без направления",completed_tasks:1,actual_minutes:0}
 ]);
});
