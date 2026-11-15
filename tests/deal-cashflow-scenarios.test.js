import test from "node:test";
import assert from "node:assert/strict";
import { buildDealCashflowScenarios } from "../functions/_lib/deal-cashflow-scenarios.js";
test("adds weighted pipeline to baseline only on expected payment dates",()=>{
 const result=buildDealCashflowScenarios({days:[{date:"2026-11-16",balance:1000,available_balance:800},{date:"2026-11-17",balance:700,available_balance:500}],deals:[{id:"a",title:"A",amount:1000,probability_percent:50,expected_close_date:"2026-11-17"},{id:"b",amount:400,probability_percent:25,expected_close_date:"2026-11-17"},{id:"c",amount:900,probability_percent:100,expected_close_date:null}]});
 assert.equal(result.weighted.additional_income,600);
 assert.equal(result.weighted.days[0].scenario_balance,1000);
 assert.equal(result.weighted.days[1].scenario_balance,1300);
 assert.equal(result.optimistic.additional_income,1400);
 assert.equal(result.undated_deal_count,1);
 assert.equal(result.undated_deal_amount,900);
});
test("keeps base forecast unchanged and flags remaining cash gaps",()=>{
 const result=buildDealCashflowScenarios({days:[{date:"2026-11-16",balance:-500,available_balance:-700}],deals:[{amount:100,probability_percent:50,expected_close_date:"2026-11-16"}]});
 assert.equal(result.weighted.days[0].baseline_balance,-500);
 assert.equal(result.weighted.days[0].scenario_balance,-450);
 assert.deepEqual(result.weighted.negative_days,["2026-11-16"]);
});
