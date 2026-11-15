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
