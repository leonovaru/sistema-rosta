import test from "node:test";
import assert from "node:assert/strict";
import { buildDailyExecutionInsights } from "../functions/_lib/daily-execution-insights.js";

test("suggests estimate adjustment only after at least three completed blocks",()=>{
 const logs=[1,2,3].map((n)=>({status:"done",planned_minutes:50,actual_minutes:70}));
 const result=buildDailyExecutionInsights(logs);
 assert.equal(result.sample_size,3);
 assert.equal(result.insights[0].type,"estimate");
 assert.match(result.insights[0].recommendation,/15–20%/);
});
test("detects repeated skipped and interrupted blocks without guessing their cause",()=>{
 const logs=[
  {status:"done",planned_minutes:30,actual_minutes:30},
  {status:"skipped",planned_minutes:30,actual_minutes:0},
  {status:"skipped",planned_minutes:30,actual_minutes:0},
  {status:"interrupted",planned_minutes:30,actual_minutes:10},
  {status:"interrupted",planned_minutes:30,actual_minutes:10}
 ];
 const result=buildDailyExecutionInsights(logs);
 assert.ok(result.insights.some(item=>item.type==="skips"));
 assert.ok(result.insights.some(item=>item.type==="interruptions"));
 assert.ok(result.insights.every(item=>!/усталост|выгор|причин/.test(item.title.toLowerCase())));
});
test("does not produce recommendations from too few observations",()=>{
 const result=buildDailyExecutionInsights([{status:"skipped",planned_minutes:30,actual_minutes:0}]);
 assert.equal(result.insights.length,0);
});
