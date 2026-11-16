import test from "node:test";
import assert from "node:assert/strict";
import { buildMonthlyVariableExpenseSchedule } from "../functions/_lib/monthly-variable-expense-schedule.js";
test("builds a month-by-month variable expense schedule using each month's budget",()=>{
 const r=buildMonthlyVariableExpenseSchedule({today:"2026-11-15",horizonDays:60,historicalCategories:[{category:"Продукты",forecast:30000},{category:"Транспорт",forecast:8000}],budgets:[{month:"2026-11",category:"Продукты",planned_amount:25000},{month:"2026-12",category:"Продукты",planned_amount:28000},{month:"2026-12",category:"Коты",planned_amount:7000}]});
 assert.deepEqual(r.map(x=>x.month),["2026-11","2026-12","2027-01"]);
 assert.equal(r[0].total,33000);
 assert.equal(r[1].total,43000);
 assert.equal(r[2].total,38000);
 assert.equal(r[1].categories.find(x=>x.category==="Продукты").source,"monthly_budget");
});
test("keeps zero budget as an intentional zero and does not invent unbudgeted categories",()=>{
 const r=buildMonthlyVariableExpenseSchedule({today:"2026-11-01",horizonDays:2,historicalCategories:[],budgets:[{month:"2026-11",category:"Продукты",planned_amount:0}]});
 assert.equal(r[0].total,0);
});
