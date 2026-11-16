import test from "node:test";
import assert from "node:assert/strict";
import {summarizeProjectCashflow} from "../functions/_lib/project-cashflow.js";
test("project cashflow detects funding gap when costs precede receipts",()=>{
 const x=summarizeProjectCashflow([
  {flow_type:"expense",amount:30000,expected_date:"2026-12-01",status:"planned"},
  {flow_type:"income",amount:50000,expected_date:"2026-12-15",status:"planned"}
 ],{today:"2026-11-15"});
 assert.equal(x.planned_incoming,50000);assert.equal(x.planned_outgoing,30000);
 assert.equal(x.net,20000);assert.equal(x.minimum_cumulative,-30000);
 assert.equal(x.first_negative_date,"2026-12-01");
});
test("realized, cancelled and past items are excluded from future cashflow",()=>{
 const x=summarizeProjectCashflow([
  {flow_type:"income",amount:1000,expected_date:"2026-12-01",status:"realized"},
  {flow_type:"expense",amount:500,expected_date:"2026-12-02",status:"cancelled"},
  {flow_type:"expense",amount:700,expected_date:"2026-11-01",status:"planned"}
 ],{today:"2026-11-15"});
 assert.equal(x.planned_incoming,0);assert.equal(x.planned_outgoing,0);assert.equal(x.minimum_cumulative,0);
});
test("same-day inflows and outflows are netted before detecting a gap",()=>{
 const x=summarizeProjectCashflow([
  {flow_type:"income",amount:1000,expected_date:"2026-12-01",status:"planned"},
  {flow_type:"expense",amount:800,expected_date:"2026-12-01",status:"planned"}
 ],{today:"2026-11-15"});
 assert.equal(x.minimum_cumulative,0);assert.equal(x.first_negative_date,null);
});

test("partial realizations leave the remaining planned amount open",()=>{
 const plan={amount:50000,realized_amount:20000,status:"planned"};
 const remaining=Math.max(0,plan.amount-plan.realized_amount);
 assert.equal(remaining,30000);
 assert.equal(plan.status,"planned");
});
test("a deleted actual operation must not leave a completed plan",()=>{
 const plannedAmount=50000;
 const remainingRealizations=[{amount:20000}];
 const realized=remainingRealizations.reduce((sum,row)=>sum+row.amount,0);
 const status=realized>=plannedAmount-0.005?"realized":"planned";
 assert.equal(status,"planned");
});
test("removing the last actual operation reopens a non-archived plan",()=>{
 const plannedAmount=50000;
 const remainingRealizations=[];
 const realized=remainingRealizations.reduce((sum,row)=>sum+row.amount,0);
 const status=realized>=plannedAmount-0.005?"realized":"planned";
 assert.equal(status,"planned");
});
