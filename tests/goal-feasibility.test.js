import test from "node:test";
import assert from "node:assert/strict";
import { buildGoalFeasibility } from "../functions/_lib/goal-feasibility.js";
test("calculates conservative monthly capacity after debt and active goals",()=>{
 const r=buildGoalFeasibility({income:900000,expenses:450000,debtPayments:90000,obligationPayments:60000,activeGoalContributions:30000,targetAmount:120000,savedAmount:20000,months:10,historyDays:90});
 assert.equal(r.average_monthly_surplus,101458);
 assert.equal(r.available_before_goals,71458);
 assert.equal(r.safe_monthly_contribution,50020);
 assert.equal(r.required_monthly_contribution,10000);
 assert.equal(r.feasible,true);
});
test("does not invent capacity when income history is missing",()=>{
 const r=buildGoalFeasibility({income:0,expenses:0,targetAmount:100000,historyDays:90});
 assert.equal(r.safe_monthly_contribution,null);
 assert.equal(r.has_enough_history,false);
 assert.equal(r.feasible,null);
});
test("flags a goal whose requested monthly contribution exceeds safe capacity",()=>{
 const r=buildGoalFeasibility({income:300000,expenses:270000,targetAmount:100000,savedAmount:0,months:2,historyDays:90});
 assert.equal(r.required_monthly_contribution,50000);
 assert.equal(r.safe_monthly_contribution,7102);
 assert.equal(r.feasible,false);
});