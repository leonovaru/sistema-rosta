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
