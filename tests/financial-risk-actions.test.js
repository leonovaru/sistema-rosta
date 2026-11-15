import test from "node:test";
import assert from "node:assert/strict";
import { buildFinancialRiskActions, buildRiskSalesPlan } from "../functions/_lib/financial-risk-actions.js";
test("groups consecutive deficit days and calculates weighted deal coverage",()=>{
 const result=buildFinancialRiskActions({days:[{date:"2026-11-16",available_balance:100},{date:"2026-11-17",available_balance:-500},{date:"2026-11-18",available_balance:-800},{date:"2026-11-19",available_balance:20}],deals:[{id:"a",title:"Проект А",amount:1000,probability_percent:50,expected_close_date:"2026-11-16"},{id:"b",title:"Проект Б",amount:2000,probability_percent:20,expected_close_date:"2026-11-18"},{id:"c",title:"Без даты",amount:9000,probability_percent:100,expected_close_date:null}]});
 assert.equal(result.total_risk_periods,1);
 assert.equal(result.first_risk.from,"2026-11-17");
 assert.equal(result.first_risk.to,"2026-11-18");
 assert.equal(result.first_risk.required_additional_income,800);
 assert.equal(result.first_risk.weighted_pipeline_before_risk,500);
 assert.equal(result.first_risk.remaining_gap_after_weighted_pipeline,300);
 assert.equal(result.first_risk.dated_deals.length,1);
 assert.equal(result.first_risk.suggested_actions.at(-1).amount,300);
});
test("does not suggest sales when no cash deficit exists",()=>{
 const result=buildFinancialRiskActions({days:[{date:"2026-11-16",available_balance:1}],deals:[]});
 assert.equal(result.has_risk,false);
 assert.equal(result.first_risk,null);
});
test("does not count deals expected after first deficit day",()=>{
 const result=buildFinancialRiskActions({days:[{date:"2026-11-16",available_balance:-100}],deals:[{id:"late",title:"Поздняя",amount:1000,probability_percent:100,expected_close_date:"2026-11-20"}]});
 assert.equal(result.first_risk.weighted_pipeline_before_risk,0);
 assert.equal(result.first_risk.remaining_gap_after_weighted_pipeline,100);
});

test("allocates cash shortfall by direction share and calculates weekly funnel activity",()=>{
 const plan=buildRiskSalesPlan({today:"2026-11-15",risk:{from:"2026-11-22",required_additional_income:10000},directions:[
  {direction_id:"a",title:"А",share_percent:60,average_sale_amount:5000,contact_to_lead_percent:50,lead_to_sale_percent:50},
  {direction_id:"b",title:"Б",share_percent:40,average_sale_amount:10000,contact_to_lead_percent:40,lead_to_sale_percent:25}
 ]});
 assert.equal(plan.total_required,10000);
 assert.equal(plan.weeks_to_deadline,1);
 assert.equal(plan.directions[0].allocated_amount,6000);
 assert.equal(plan.directions[0].sales_required,2);
 assert.equal(plan.directions[0].qualified_leads_required,4);
 assert.equal(plan.directions[0].outreach_required,8);
 assert.equal(plan.directions[1].allocated_amount,4000);
 assert.equal(plan.directions[1].sales_required,1);
});
test("uses equal allocation when all direction shares are zero and flags missing assumptions",()=>{
 const plan=buildRiskSalesPlan({today:"2026-11-15",risk:{from:"2026-11-30",required_additional_income:9000},directions:[
  {direction_id:"a",title:"А",share_percent:0,average_sale_amount:0,contact_to_lead_percent:40,lead_to_sale_percent:20},
  {direction_id:"b",title:"Б",share_percent:0,average_sale_amount:3000,contact_to_lead_percent:0,lead_to_sale_percent:20}
 ]});
 assert.equal(plan.weeks_to_deadline,3);
 assert.equal(plan.directions[0].allocated_amount,4500);
 assert.equal(plan.directions[0].assumptions_incomplete,true);
 assert.equal(plan.directions[1].allocated_amount,4500);
 assert.equal(plan.directions[1].assumptions_incomplete,true);
});
