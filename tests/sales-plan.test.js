import test from "node:test";
import assert from "node:assert/strict";
import { buildSalesPlan } from "../functions/_lib/sales-plan.js";
test("calculates required sales, leads and outreach from explicit funnel assumptions",()=>{
 const [x]=buildSalesPlan([{direction_id:"a",title:"Аудит",remaining_target:120000,average_sale_amount:30000,contact_to_lead_percent:40,lead_to_sale_percent:25}],28);
 assert.equal(x.sales_required,4);assert.equal(x.qualified_leads_required,16);assert.equal(x.outreach_required,40);assert.equal(x.weekly_outreach,10);
});
test("does not invent funnel volume when average ticket or conversion is missing",()=>{
 const [x]=buildSalesPlan([{direction_id:"a",remaining_target:50000,average_sale_amount:0,contact_to_lead_percent:40,lead_to_sale_percent:20}],14);
 assert.equal(x.sales_required,null);assert.equal(x.outreach_required,null);assert.equal(x.assumptions_incomplete,true);
});
test("keeps zero remaining target at zero actions",()=>{
 const [x]=buildSalesPlan([{direction_id:"a",remaining_target:0,average_sale_amount:10000,contact_to_lead_percent:40,lead_to_sale_percent:20}],30);
 assert.equal(x.sales_required,0);assert.equal(x.outreach_required,0);
});

test("includes real lead counts separately from calculated outreach requirements",()=>{
 const [x]=buildSalesPlan([{direction_id:"a",title:"AI",remaining_target:60000,average_sale_amount:20000,contact_to_lead_percent:50,lead_to_sale_percent:25,potential_clients:7,contacted_clients:3}],14);
 assert.equal(x.potential_clients,7);
 assert.equal(x.contacted_clients,3);
 assert.equal(x.outreach_required,24);
});
