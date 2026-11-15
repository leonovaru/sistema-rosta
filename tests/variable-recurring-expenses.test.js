import test from "node:test";
import assert from "node:assert/strict";
import { detectVariableRecurringExpenses } from "../functions/_lib/variable-recurring-expenses.js";
test("detects monthly utility bills with changing amounts and forecasts the average",()=>{
 const rows=[
  {id:"1",title:"Электричество",category:"Коммунальные",amount:1200,spent_on:"2026-08-10"},
  {id:"2",title:"Электричество",category:"Коммунальные",amount:1800,spent_on:"2026-09-10"},
  {id:"3",title:"Электричество",category:"Коммунальные",amount:1500,spent_on:"2026-10-10"}
 ];
 const result=detectVariableRecurringExpenses(rows,{today:"2026-11-15",horizonDays:60});
 assert.equal(result.suggestions.length,1);
 assert.equal(result.suggestions[0].average_amount,1500);
 assert.deepEqual(result.events.map(x=>x.date),["2026-12-10"]);
 assert.deepEqual(result.matched_expense_ids,["1","2","3"]);
});
test("does not classify stable bills or irregular expenses as variable recurring",()=>{
 const rows=[
  {id:"1",title:"Интернет",category:"Связь",amount:900,spent_on:"2026-08-10"},
  {id:"2",title:"Интернет",category:"Связь",amount:900,spent_on:"2026-09-10"},
  {id:"3",title:"Интернет",category:"Связь",amount:900,spent_on:"2026-10-10"},
  {id:"4",title:"Врач",category:"Здоровье",amount:1000,spent_on:"2026-08-10"},
  {id:"5",title:"Врач",category:"Здоровье",amount:2000,spent_on:"2026-09-28"},
  {id:"6",title:"Врач",category:"Здоровье",amount:1500,spent_on:"2026-10-10"}
 ];
 const result=detectVariableRecurringExpenses(rows,{today:"2026-11-15",horizonDays:90});
 assert.equal(result.suggestions.length,0);
 assert.equal(result.matched_expense_ids.length,0);
});
test("does not project a past bill date; moves it to the next month",()=>{
 const rows=[
  {id:"1",title:"Вода",category:"Коммунальные",amount:500,spent_on:"2026-08-05"},
  {id:"2",title:"Вода",category:"Коммунальные",amount:700,spent_on:"2026-09-05"},
  {id:"3",title:"Вода",category:"Коммунальные",amount:600,spent_on:"2026-10-05"}
 ];
 const result=detectVariableRecurringExpenses(rows,{today:"2026-11-15",horizonDays:35});
 assert.deepEqual(result.events.map(x=>x.date),["2026-12-05"]);
});
