import test from "node:test";
import assert from "node:assert/strict";
import {calculateProjectEconomics,calculateClientEconomics} from "../functions/_lib/project-economics.js";

test("project economics separates agreed value, receipts, direct costs and time",()=>{
 const x=calculateProjectEconomics({plannedRevenue:100000,received:60000,directExpenses:15000,minutes:900});
 assert.equal(x.outstanding,40000);
 assert.equal(x.contribution,45000);
 assert.equal(x.hours,15);
 assert.equal(x.revenue_per_hour,4000);
 assert.equal(x.contribution_per_hour,3000);
 assert.equal(x.status,"awaiting_payment");
});
test("project economics flags negative contribution and overspending",()=>{
 assert.equal(calculateProjectEconomics({received:10000,directExpenses:12000}).status,"loss");
 assert.equal(calculateProjectEconomics({directExpenses:12000}).status,"loss");
 assert.equal(calculateProjectEconomics({plannedCosts:5000,directExpenses:6000}).status,"over_budget");
});
test("missing history does not invent hourly metrics or margins",()=>{
 const x=calculateProjectEconomics({plannedRevenue:20000});
 assert.equal(x.revenue_per_hour,null);
 assert.equal(x.contribution_per_hour,null);
 assert.equal(x.margin_percent,null);
 assert.equal(x.outstanding,20000);
});

test("client economics calculates contribution and effective hourly rates from tracked time",()=>{
 const x=calculateClientEconomics({revenue:48000,directExpenses:8000,trackedMinutes:600});
 assert.equal(x.contribution,40000);
 assert.equal(x.margin_percent,83.33);
 assert.equal(x.hours,10);
 assert.equal(x.revenue_per_hour,4800);
 assert.equal(x.contribution_per_hour,4000);
});
test("client economics leaves hourly rates blank when there is no tracked time",()=>{
 const x=calculateClientEconomics({revenue:12000,directExpenses:2000});
 assert.equal(x.revenue_per_hour,null);
 assert.equal(x.contribution_per_hour,null);
});

test("completion or archival does not erase an outstanding project receivable",()=>{
 for(const status of ["active","waiting","done","archived"]){
  const x=calculateProjectEconomics({status,plannedRevenue:100000,received:65000,directExpenses:20000,minutes:600});
  assert.equal(x.outstanding,35000,status);
  assert.equal(x.contribution,45000,status);
  assert.equal(x.status,"awaiting_payment",status);
 }
});
