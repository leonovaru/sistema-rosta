import test from "node:test";
import assert from "node:assert/strict";
import { buildCashflowForecast } from "../functions/_lib/cashflow-forecast.js";
test("forecast combines planned cash flows, recurring obligations and debt minimums",()=>{
 const x=buildCashflowForecast({today:"2026-11-15",horizonDays:30,startingBalance:10000,planned:[{expected_date:"2026-11-20",flow_type:"income",title:"Оплата клиента",amount:20000},{expected_date:"2026-11-22",flow_type:"expense",title:"Сервис",amount:1000}],obligations:[{due_date:"2026-11-18",frequency:"monthly",recurrence_day:18,title:"Аренда",amount:5000}],debts:[{title:"Кредит",balance:9000,minimum_payment:3000,due_day:25,status:"open"}]});
 assert.equal(x.summary.planned_income,20000);assert.equal(x.summary.planned_expenses,9000);assert.equal(x.summary.ending_balance,21000);assert.equal(x.events.length,4);assert.equal(x.events.find(e=>e.source==="debt_minimum").amount,3000);
});
test("monthly obligations clamp to month end and repeat in next month",()=>{
 const x=buildCashflowForecast({today:"2026-01-30",horizonDays:35,obligations:[{due_date:"2026-01-31",frequency:"monthly",recurrence_day:31,title:"Аренда",amount:100}]});
 assert.deepEqual(x.events.map(e=>e.date),["2026-01-31","2026-02-28"]);
});
test("forecast excludes past planned flows and closed debts",()=>{
 const x=buildCashflowForecast({today:"2026-11-15",horizonDays:30,planned:[{expected_date:"2026-11-14",flow_type:"income",amount:500,title:"Past"}],debts:[{title:"Closed",balance:500,minimum_payment:100,due_day:20,status:"closed"}]});
 assert.equal(x.events.length,0);assert.equal(x.summary.ending_balance,0);
});
test("negative cash days are surfaced instead of hidden by a positive final balance",()=>{
 const x=buildCashflowForecast({today:"2026-11-15",horizonDays:10,startingBalance:100,obligations:[{due_date:"2026-11-16",frequency:"once",amount:200,title:"Bill"}],planned:[{expected_date:"2026-11-20",flow_type:"income",amount:500,title:"Payment"}]});
 assert.deepEqual(x.summary.negative_days,["2026-11-16","2026-11-17","2026-11-18","2026-11-19"]);assert.equal(x.summary.ending_balance,400);
});

test("planned forecast events retain identifiers for safe deletion",()=>{
 const x=buildCashflowForecast({today:"2026-11-15",horizonDays:5,planned:[{id:"plan-1",expected_date:"2026-11-16",flow_type:"income",title:"Client",amount:100}]});
 assert.equal(x.events[0].id,"plan-1");
});
test("invalid calendar dates are rejected",()=>{
 assert.throws(()=>buildCashflowForecast({today:"2026-02-30"}));
});

test("variable expenses reduce daily cash balance without inventing dated events",()=>{
 const x=buildCashflowForecast({today:"2026-11-15",horizonDays:15,startingBalance:10000,variableExpensesByMonth:[{month:"2026-11",total:30000}]});
 assert.equal(x.events.length,0);
 assert.equal(x.summary.variable_expenses,16000);
 assert.equal(x.summary.ending_balance,-6000);
 assert.equal(x.days[0].variable_expenses,1000);
 assert.equal(x.days[0].events.length,0);
});
test("variable expense forecast switches to the next month's budget",()=>{
 const x=buildCashflowForecast({today:"2026-11-30",horizonDays:2,startingBalance:5000,variableExpensesByMonth:[{month:"2026-11",total:30000},{month:"2026-12",total:62000}]});
 assert.equal(x.summary.variable_expenses,1000+2000*2);
 assert.equal(x.summary.ending_balance,0);
});

test("reserves reduce spendable money without being counted as cash expenses",()=>{
 const x=buildCashflowForecast({today:"2026-11-01",horizonDays:9,startingBalance:50000,reserves:[{title:"Ремонт",target_amount:30000,current_amount:10000,monthly_contribution:6000,active:1}]});
 assert.equal(x.summary.ending_balance,50000);
 assert.equal(x.summary.existing_reserves,10000);
 assert.equal(x.summary.new_reserve_allocations,2000);
 assert.equal(x.summary.available_ending_balance,38000);
 assert.equal(x.summary.total_expenses,0);
 assert.equal(x.days[0].available_balance,39800);
});
test("reserve contributions stop when the target is fully funded",()=>{
 const x=buildCashflowForecast({today:"2026-11-01",horizonDays:30,startingBalance:10000,reserves:[{title:"Фонд",target_amount:1200,current_amount:1000,monthly_contribution:600,active:1}]});
 assert.equal(x.summary.new_reserve_allocations,200);
 assert.equal(x.summary.available_ending_balance,8800);
});

test("yearly and quarterly irregular expenses appear on their actual recurrence dates",()=>{
 const x=buildCashflowForecast({today:"2026-11-15",horizonDays:110,reserves:[],irregularExpenses:[
  {id:"year",title:"Страховка",amount:12000,next_date:"2026-12-01",frequency:"yearly"},
  {id:"quarter",title:"Обслуживание",amount:3000,next_date:"2026-11-30",frequency:"quarterly"},
  {id:"once",title:"Покупка",amount:5000,next_date:"2026-12-15",frequency:"once"}
 ]});
 assert.deepEqual(x.events.filter(e=>e.source==="irregular_expense").map(e=>[e.title,e.date]),[
  ["Обслуживание","2026-11-30"],["Страховка","2026-12-01"],["Покупка","2026-12-15"],["Обслуживание","2027-02-28"]
 ]);
 assert.equal(x.summary.planned_expenses,23000);
});
test("recurring irregular expense advances from month end without invalid dates",()=>{
 const x=buildCashflowForecast({today:"2026-02-20",horizonDays:40,irregularExpenses:[{title:"Годовой платёж",amount:1000,next_date:"2025-02-28",frequency:"yearly"}]});
 assert.deepEqual(x.events.map(e=>e.date),["2026-02-28"]);
});

test("quarterly recurrence preserves the original day after short months",()=>{
 const x=buildCashflowForecast({today:"2027-01-01",horizonDays:220,irregularExpenses:[{title:"Квартальный платёж",amount:500,next_date:"2027-01-31",frequency:"quarterly"}]});
 assert.deepEqual(x.events.map(e=>e.date),["2027-01-31","2027-04-30","2027-07-31"]);
});

test("variable recurring bills are dated events, separate from daily variable spending",()=>{
 const x=buildCashflowForecast({today:"2026-11-15",horizonDays:30,startingBalance:5000,variableExpensesByMonth:[{month:"2026-11",total:3000}],variableRecurringEvents:[{date:"2026-11-20",type:"expense",title:"Электричество (оценка)",amount:1500}]});
 assert.equal(x.events.length,1);
 assert.equal(x.events[0].source,"variable_recurring");
 assert.equal(x.summary.planned_expenses,1500);
 assert.equal(x.summary.variable_expenses,1600);
 assert.equal(x.summary.ending_balance,1900);
});
test("calendar events show project attribution and the closing spendable balance for their date",()=>{
 const x=buildCashflowForecast({today:"2026-11-15",horizonDays:5,startingBalance:10000,reserves:[{title:"Reserve",target_amount:2000,current_amount:1000,monthly_contribution:0,active:1}],planned:[
  {id:"project-payment",expected_date:"2026-11-16",flow_type:"income",title:"Оплата этапа",amount:5000,client_name:"Клиент А",project_title:"Сайт"}
 ],obligations:[{due_date:"2026-11-16",frequency:"once",title:"Аренда",amount:3000}]});
 const event=x.events.find(e=>e.id==="project-payment");
 assert.equal(event.client_name,"Клиент А");
 assert.equal(event.project_title,"Сайт");
 assert.equal(event.day_closing_balance,12000);
 assert.equal(event.day_available_balance,11000);
});

test("reserve forecast prorates the current month and still reaches the target without underfunding",()=>{
 const x=buildCashflowForecast({today:"2026-11-15",horizonDays:150,startingBalance:20000,reserves:[{title:"Фонд",target_amount:10000,current_amount:0,monthly_contribution:3000,target_date:"2027-03-31",active:1}]});
 assert.equal(x.summary.new_reserve_allocations,10000);
 assert.equal(x.summary.available_ending_balance,10000);
 assert.equal(x.days.find(day=>day.date==="2026-11-15").reserve_allocations,100);
 assert.equal(x.days.find(day=>day.date==="2026-11-30").reserve_allocations,100);
 assert.equal(x.days.find(day=>day.date==="2027-03-31").reserve_allocations,0);
});
test("reserve forecast does not allocate contributions after a mid-month target date",()=>{
 const x=buildCashflowForecast({today:"2026-11-01",horizonDays:30,startingBalance:5000,reserves:[{title:"Цель",target_amount:5000,current_amount:0,monthly_contribution:3000,target_date:"2026-11-15",active:1}]});
 assert.equal(x.summary.new_reserve_allocations,1500);
 assert.equal(x.days.find(day=>day.date==="2026-11-15").reserve_allocations,100);
 assert.equal(x.days.find(day=>day.date==="2026-11-16").reserve_allocations,0);
});

test("overdue one-time obligations remain visible as due today",()=>{
 const x=buildCashflowForecast({today:"2026-11-15",horizonDays:10,startingBalance:5000,obligations:[{due_date:"2026-11-10",frequency:"once",title:"Просроченный счёт",amount:1200}]});
 assert.equal(x.events.length,1);
 assert.equal(x.events[0].date,"2026-11-15");
 assert.equal(x.events[0].source,"overdue_obligation");
 assert.equal(x.events[0].original_due_date,"2026-11-10");
 assert.equal(x.events[0].overdue_days,5);
 assert.equal(x.summary.ending_balance,3800);
});
test("overdue recurring obligations are shown today and retain their next scheduled date",()=>{
 const x=buildCashflowForecast({today:"2026-11-15",horizonDays:50,startingBalance:5000,obligations:[{due_date:"2026-11-10",frequency:"monthly",recurrence_day:10,title:"Аренда",amount:1000}]});
 assert.deepEqual(x.events.map(e=>[e.date,e.source]),[["2026-11-15","overdue_obligation"],["2026-12-10","obligation"]]);
 assert.equal(x.summary.planned_expenses,2000);
 assert.equal(x.summary.ending_balance,3000);
});

test("overdue debt minimum payment is surfaced today before the next monthly due date",()=>{
 const x=buildCashflowForecast({today:"2026-11-15",horizonDays:40,startingBalance:5000,debts:[{title:"Кредит",balance:5000,minimum_payment:1000,due_day:10,status:"open"}]});
 assert.deepEqual(x.events.map(e=>[e.date,e.source,e.amount]),[["2026-11-15","overdue_debt_minimum",1000],["2026-12-10","debt_minimum",1000]]);
 assert.equal(x.events[0].original_due_date,"2026-11-10");
 assert.equal(x.events[0].overdue_days,5);
 assert.equal(x.summary.planned_expenses,2000);
 assert.equal(x.summary.ending_balance,3000);
});
test("overdue debt minimum is capped by the remaining debt balance",()=>{
 const x=buildCashflowForecast({today:"2026-11-15",horizonDays:10,startingBalance:500,debts:[{title:"Маленький долг",balance:300,minimum_payment:1000,due_day:10,status:"open"}]});
 assert.equal(x.events.length,1);
 assert.equal(x.events[0].amount,300);
 assert.equal(x.summary.ending_balance,200);
});
