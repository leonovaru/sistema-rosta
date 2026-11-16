import test from "node:test";
import assert from "node:assert/strict";
import { forecastDebt, buildDebtForecast } from "../functions/_lib/finance.js";
test("monthly interest and minimum payment are reflected in schedule",()=>{const r=forecastDebt({balance:10000,interest_rate:12,minimum_payment:1000});assert.equal(r.schedule[0].interest,100);assert.equal(r.schedule[0].payment,1000);assert.equal(r.schedule[0].closing_balance,9100);});
test("extra monthly payment reduces payoff time and interest",()=>{const d={balance:12000,interest_rate:12,minimum_payment:1000};const a=forecastDebt(d),b=forecastDebt(d,1000);assert.ok(b.months_to_payoff<a.months_to_payoff);assert.ok(b.total_interest<a.total_interest);});
test("no payment does not pretend debt is paid off",()=>{const r=forecastDebt({balance:5000,interest_rate:24,minimum_payment:0});assert.equal(r.months_to_payoff,null);assert.equal(r.limited,true);});
test("aggregate sums balances and payments across debts",()=>{const r=buildDebtForecast([{id:"a",title:"A",balance:1000,interest_rate:0,minimum_payment:500,status:"open"},{id:"b",title:"B",balance:2000,interest_rate:0,minimum_payment:500,status:"open"}]);assert.equal(r.summary.current_balance,3000);assert.equal(r.months[0].payment,1000);assert.equal(r.months[0].balance,2000);});

test("payment below monthly interest reports growing balance and unresolved debt",()=>{
 const r=forecastDebt({balance:10000,interest_rate:24,minimum_payment:100});
 assert.equal(r.schedule[0].interest,200);
 assert.equal(r.schedule[0].payment,100);
 assert.equal(r.schedule[0].closing_balance,10100);
 assert.equal(r.months_to_payoff,null);
 assert.equal(r.limited,true);
});
test("final payment is capped at principal plus that month's interest",()=>{
 const r=forecastDebt({balance:1000,interest_rate:12,minimum_payment:1000});
 assert.equal(r.schedule[0].interest,10);
 assert.equal(r.schedule[0].payment,1010);
 assert.equal(r.schedule[0].closing_balance,0);
 assert.equal(r.total_paid,1010);
 assert.equal(r.months_to_payoff,1);
});
