import test from "node:test";
import assert from "node:assert/strict";
import { buildRevenuePlan } from "../functions/_lib/revenue-plan.js";
test("splits monthly goal equally as a proposal when no allocations exist",()=>{
 const x=buildRevenuePlan({monthlyTarget:300000,directionRows:[{id:"a",title:"A"},{id:"b",title:"B"}],daysInMonth:30,dayOfMonth:1});
 assert.equal(x.suggested_allocation,true);assert.equal(x.directions[0].monthly_target,150000);assert.equal(x.allocated_target,300000);assert.equal(x.unallocated_target,0);
});
test("uses saved shares, current receipts, average ticket and sales count",()=>{
 const x=buildRevenuePlan({monthlyTarget:300000,directionRows:[{id:"a",title:"Audit",share_percent:60,average_sale_amount:15000},{id:"b",title:"Sheets",share_percent:20,average_sale_amount:5000}],actualRows:[{direction_id:"a",actual:30000}],daysInMonth:30,dayOfMonth:10});
 const a=x.directions[0];assert.equal(a.monthly_target,180000);assert.equal(a.remaining,150000);assert.equal(a.required_sales,10);assert.equal(a.weekly_target,41426.93);assert.equal(x.unallocated_target,60000);assert.equal(x.actual_total,30000);
});
test("does not fabricate a sales count when average ticket is unknown",()=>{
 const x=buildRevenuePlan({monthlyTarget:100000,directionRows:[{id:"a",title:"A",share_percent:100}],daysInMonth:31,dayOfMonth:31});
 assert.equal(x.directions[0].required_sales,null);assert.equal(x.required_daily_total,100000);
});
