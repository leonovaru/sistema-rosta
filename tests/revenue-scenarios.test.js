import test from "node:test";
import assert from "node:assert/strict";
import { buildRevenueScenarios } from "../functions/_lib/revenue-scenarios.js";
test("compares monthly receipts only with monthly targets and uses 90-day history for hourly rate",()=>{
 const x=buildRevenueScenarios({monthlyTarget:300000,directionRows:[{id:"a",title:"Аудит",share_percent:60,average_sale_amount:30000},{id:"b",title:"Таблицы",share_percent:40,average_sale_amount:10000}],actualRows:[{direction_id:"a",revenue:30000},{direction_id:"b",revenue:12000}],historyRows:[{direction_id:"a",revenue:90000},{direction_id:"b",revenue:36000}],taskRows:[{direction_id:"a",actual_minutes:1800},{direction_id:"b",actual_minutes:900}],weeklyCapacityHours:10});
 const realistic=x.scenarios[1],a=realistic.directions[0];
 assert.deepEqual(x.scenarios.map(s=>s.target),[210000,300000,390000]);
 assert.equal(realistic.actual,42000);assert.equal(a.remaining,150000);assert.equal(a.historical_revenue_per_hour,3000);assert.equal(a.required_hours,50);assert.equal(realistic.capacity_fit,false);
});
test("suggests equal allocation only when no shares were configured",()=>{
 const x=buildRevenueScenarios({monthlyTarget:100000,directionRows:[{id:"a",title:"A",share_percent:0},{id:"b",title:"B",share_percent:0}]});
 assert.equal(x.suggested_allocation,true);assert.equal(x.scenarios[1].directions[0].monthly_target,50000);
});
test("does not invent sales or workload estimates without average ticket or history",()=>{
 const x=buildRevenueScenarios({monthlyTarget:100000,directionRows:[{id:"a",title:"A",share_percent:100,average_sale_amount:0}]});
 const d=x.scenarios[1].directions[0];assert.equal(d.required_sales,null);assert.equal(d.required_hours,null);assert.equal(x.scenarios[1].capacity_fit,null);
});
test("keeps unallocated share visible by not redistributing a partially configured target",()=>{
 const x=buildRevenueScenarios({monthlyTarget:100000,directionRows:[{id:"a",title:"A",share_percent:50}]});
 assert.equal(x.scenarios[1].directions[0].monthly_target,50000);
});
test("shows a direction with no revenue history as lacking an hourly rate",()=>{
 const x=buildRevenueScenarios({monthlyTarget:100000,directionRows:[{id:"a",title:"New",share_percent:100}],actualRows:[{direction_id:"a",revenue:10000}],taskRows:[{direction_id:"a",actual_minutes:0}]});
 assert.equal(x.scenarios[1].directions[0].historical_revenue_per_hour,null);assert.equal(x.scenarios[1].capacity_fit,null);
});
