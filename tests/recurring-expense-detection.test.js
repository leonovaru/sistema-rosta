import test from "node:test";
import assert from "node:assert/strict";
import { detectRecurringExpenses } from "../functions/_lib/recurring-expense-detection.js";

test("suggests stable monthly payments after three matching expenses",()=>{
 const rows=["2026-08-05","2026-09-05","2026-10-05"].map((spent_on)=>({title:"Домашний интернет",category:"Связь",amount:650,spent_on}));
 const found=detectRecurringExpenses(rows,{today:"2026-11-10"});
 assert.equal(found.length,1);
 assert.equal(found[0].frequency,"monthly");
 assert.equal(found[0].next_date,"2026-11-05");
 assert.equal(found[0].amount,650);
});

test("does not suggest variable amounts, irregular intervals, or fewer than three records",()=>{
 const rows=[
  {title:"Аренда",category:"Жильё",amount:20000,spent_on:"2026-08-01"},
  {title:"Аренда",category:"Жильё",amount:25000,spent_on:"2026-09-01"},
  {title:"Аренда",category:"Жильё",amount:20000,spent_on:"2026-10-01"},
  {title:"Продукты",category:"Еда",amount:5000,spent_on:"2026-08-02"},
  {title:"Продукты",category:"Еда",amount:5100,spent_on:"2026-09-02"}
 ];
 assert.equal(detectRecurringExpenses(rows,{today:"2026-11-10"}).length,0);
});

test("does not duplicate existing obligations or re-suggest paid irregular expense records",()=>{
 const rows=["2026-08-10","2026-09-10","2026-10-10"].map(spent_on=>({title:"Страховка",category:"Авто",amount:1000,spent_on}));
 const found=detectRecurringExpenses(rows,{today:"2026-11-10",existingTitles:["Страховка"]});
 assert.equal(found.length,0);
});
