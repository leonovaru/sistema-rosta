import test from "node:test";
import assert from "node:assert/strict";
import { buildRevenueScenarios } from "../functions/_lib/revenue-scenarios.js";
test("creates conservative realistic and ambitious scenarios from the revenue target",()=>{
 const x=buildRevenueScenarios({monthlyTarget:300000,directionRows:[{id:"a",title:"Аудит",share_percent:60,average_sale_amount:30000},{id:"b",title:"Таблицы",share_percent:40,average_sale_amount:10000}],actualRows:[{direction_id:"a",revenue:30000}],taskRows:[{direction_id:"a",actual_minutes:600},{direction_id:"b",actual_minutes:300}],weeklyCapacityHours:25});
 assert.deepEqual(x.scenarios.map(s=>s.target),[210000,300000,390000]);
 assert.equal(x.scenarios[1].directions[0].required_sales,5);
 assert.equal(x.scenarios[1].directions[0].required_hours,50);
 assert.equal(x.scenarios[1].capacity_fit,false);
});
test("suggests equal allocation only when no shares were configured",()=>{
 const x=buildRevenueScenarios({monthlyTarget:100000,directionRows:[{id:"a",title:"A",share_percent:0},{id:"b",title:"B",share_percent:0}]});
 assert.equal(x.suggested_allocation,true);
 assert.equal(x.scenarios[1].directions[0].monthly_target,50000);
});
test("does not invent sales or workload estimates without average ticket or history",()=>{
 const x=buildRevenueScenarios({monthlyTarget:100000,directionRows:[{id:"a",title:"A",share_percent:100,average_sale_amount:0}]});
 const d=x.scenarios[1].directions[0];
 assert.equal(d.required_sales,null);assert.equal(d.required_hours,null);assert.equal(x.scenarios[1].capacity_fit,null);
});
test("keeps unallocated share visible by not redistributing a partially configured target",()=>{
 const x=buildRevenueScenarios({monthlyTarget:100000,directionRows:[{id:"a",title:"A",share_percent:50}]});
 assert.equal(x.scenarios[1].directions[0].monthly_target,50000);
});
