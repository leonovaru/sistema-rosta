import test from "node:test";
import assert from "node:assert/strict";
import { buildVariableExpenseForecast } from "../functions/_lib/variable-expense-forecast.js";
test("forecasts next calendar month by category from three complete months",()=>{
 const r=buildVariableExpenseForecast([{category:"Продукты",month:"2026-08",total:30000},{category:"Продукты",month:"2026-09",total:33000},{category:"Продукты",month:"2026-10",total:36000},{category:"Транспорт",month:"2026-10",total:9000}],{today:"2026-11-15"});
 assert.equal(r.target_month,"2026-12");
 assert.equal(r.total,42000);
 assert.equal(r.categories.find(x=>x.category==="Продукты").forecast,33000);
 assert.equal(r.categories.find(x=>x.category==="Транспорт").months_observed,1);
});
test("does not fabricate categories without spending history",()=>{
 const r=buildVariableExpenseForecast([],{today:"2026-11-15"});
 assert.equal(r.total,0);assert.equal(r.categories.length,0);
});