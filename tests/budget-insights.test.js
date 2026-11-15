import test from "node:test";
import assert from "node:assert/strict";
import { buildBudgetInsights } from "../functions/_lib/budget-insights.js";
test("detects repeated budget overruns and suggests an average actual budget",()=>{
 const history=[
  {category:"Продукты",month:"2026-08",actual:12000},
  {category:"Продукты",month:"2026-09",actual:15000},
  {category:"Продукты",month:"2026-10",actual:18000}
 ];
 const plans=[
  {category:"Продукты",month:"2026-08",planned_amount:10000},
  {category:"Продукты",month:"2026-09",planned_amount:14000},
  {category:"Продукты",month:"2026-10",planned_amount:20000}
 ];
 const [x]=buildBudgetInsights(history,plans,{month:"2026-11",historyMonths:3});
 assert.equal(x.over_budget_months,2);
 assert.equal(x.repeated_overrun,true);
 assert.equal(x.average_actual,15000);
 assert.equal(x.suggested_budget,15000);
});
test("does not recommend changing a budget after only one overrun",()=>{
 const history=[{category:"Связь",month:"2026-08",actual:1500},{category:"Связь",month:"2026-09",actual:900},{category:"Связь",month:"2026-10",actual:900}];
 const plans=[{category:"Связь",month:"2026-08",planned_amount:1000},{category:"Связь",month:"2026-09",planned_amount:1000},{category:"Связь",month:"2026-10",planned_amount:1000}];
 const [x]=buildBudgetInsights(history,plans,{month:"2026-11",historyMonths:3});
 assert.equal(x.over_budget_months,1);
 assert.equal(x.repeated_overrun,false);
 assert.equal(x.suggested_budget,null);
});
test("includes zero-spend months when averaging a category with history",()=>{
 const history=[{category:"Коты",month:"2026-10",actual:9000}];
 const [x]=buildBudgetInsights(history,[],{month:"2026-11",historyMonths:3});
 assert.equal(x.average_actual,3000);
 assert.equal(x.months_observed,3);
});
