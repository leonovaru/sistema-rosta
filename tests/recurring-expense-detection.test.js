import test from "node:test";
import assert from "node:assert/strict";
import { detectRecurringExpenses } from "../functions/_lib/recurring-expense-detection.js";

test("suggests stable monthly payments after three matching expenses",()=>{
 const rows=["2026-08-05","2026-09-05","2026-10-05"].map((spent_on)=>({title:"Домашний интернет",category:"Связь",amount:650,spent_on}));
 const found=detectRecurringExpenses(rows,{today:"2026-11-10"});
 assert.equal(found.length,1);
 assert.equal(found[0].frequency,"monthly");
 assert.equal(found[0].next_date,"2026-12-05");
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

test("preserves end-of-month billing day when suggesting monthly payments",()=>{
 const rows=["2026-08-31","2026-09-30","2026-10-31"].map(spent_on=>({title:"Аренда склада",category:"Аренда",amount:12000,spent_on}));
 const found=detectRecurringExpenses(rows,{today:"2026-11-15"});
 assert.equal(found.length,1);
 assert.equal(found[0].next_date,"2026-11-30");
});

test("recognizes stable weekly payments",()=>{
 const rows=["2026-10-19","2026-10-26","2026-11-02"].map(spent_on=>({title:"Занятия",category:"Обучение",amount:900,spent_on}));
 const found=detectRecurringExpenses(rows,{today:"2026-11-10"});
 assert.equal(found.length,1);
 assert.equal(found[0].frequency,"weekly");
 assert.equal(found[0].next_date,"2026-11-16");
});

test("groups monthly descriptions that differ by month and payment wording",()=>{
 const rows=[
  {title:"Домашний интернет",category:"Связь",amount:650,spent_on:"2026-08-05"},
  {title:"Оплата интернета за сентябрь",category:"Связь",amount:660,spent_on:"2026-09-05"},
  {title:"Интернет за октябрь",category:"Связь",amount:655,spent_on:"2026-10-05"}
 ];
 const found=detectRecurringExpenses(rows,{today:"2026-11-10"});
 assert.equal(found.length,1);
 assert.equal(found[0].occurrences,3);
 assert.equal(found[0].amount,655);
});

test("does not merge unrelated expenses or different categories",()=>{
 const rows=[
  ...["2026-08-05","2026-09-05","2026-10-05"].map(spent_on=>({title:"Интернет",category:"Связь",amount:650,spent_on})),
  ...["2026-08-06","2026-09-06","2026-10-06"].map(spent_on=>({title:"Электричество",category:"Коммунальные услуги",amount:650,spent_on}))
 ];
 const found=detectRecurringExpenses(rows,{today:"2026-11-10"});
 assert.equal(found.length,2);
});

test("skips a recurring obligation when its title differs only by billing wording",()=>{
 const rows=["2026-08-05","2026-09-05","2026-10-05"].map(spent_on=>({title:"Домашний интернет",category:"Связь",amount:650,spent_on}));
 const found=detectRecurringExpenses(rows,{today:"2026-11-10",existingTitles:[{title:"Оплата интернета",category:"Связь"}]});
 assert.equal(found.length,0);
});

test("suggests the next future date when the last expected payment date has passed",()=>{
 const rows=["2026-08-15","2026-09-15","2026-10-15"].map(spent_on=>({title:"Абонемент",category:"Спорт",amount:1200,spent_on}));
 const found=detectRecurringExpenses(rows,{today:"2026-11-20"});
 assert.equal(found[0].next_date,"2026-12-15");
});
