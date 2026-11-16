import test from "node:test";
import assert from "node:assert/strict";
import {advanceIrregularExpenseAfterPayment} from "../functions/_lib/finance.js";
import {buildCashflowForecast} from "../functions/_lib/cashflow-forecast.js";

test("one recorded quarterly payment advances only one installment and leaves later arrears visible",()=>{
 const schedule=advanceIrregularExpenseAfterPayment("2026-05-31","quarterly",31);
 assert.deepEqual(schedule,{next_date:"2026-08-31",active:1});
 const forecast=buildCashflowForecast({today:"2026-11-15",horizonDays:30,irregularExpenses:[{
  id:"quarterly",title:"Обслуживание",amount:3000,next_date:schedule.next_date,frequency:"quarterly",recurrence_day:31
 }]});
 assert.deepEqual(forecast.events.map(event=>[event.date,event.source,event.amount]),[
  ["2026-11-15","overdue_irregular_expense",3000],
  ["2026-11-30","irregular_expense",3000]
 ]);
});

test("paying a one-time irregular expense closes its schedule",()=>{
 assert.deepEqual(advanceIrregularExpenseAfterPayment("2026-11-10","once",10),{next_date:null,active:0});
});

test("each payment of a yearly schedule advances one year, even when paid after its due date",()=>{
 assert.deepEqual(advanceIrregularExpenseAfterPayment("2024-03-15","yearly",15),{next_date:"2025-03-15",active:1});
});
