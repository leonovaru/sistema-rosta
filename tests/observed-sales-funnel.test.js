import test from "node:test";
import assert from "node:assert/strict";
import { buildObservedSalesFunnel } from "../functions/_lib/observed-sales-funnel.js";
test("calculates observed conversion from distinct clients and deal stage transitions",()=>{
 const interactions=[{direction_id:"d1",client_id:"c1"},{direction_id:"d1",client_id:"c1"},{direction_id:"d1",client_id:"c2"},{direction_id:"d1",client_id:"c3"},{direction_id:"d1",client_id:"c4"},{direction_id:"d1",client_id:"c5"}];
 const events=[
  {direction_id:"d1",client_id:"c1",changes_json:'[{"field":"stage","to":"negotiation"}]'},
  {direction_id:"d1",client_id:"c2",changes_json:'[{"field":"stage","to":"proposal"}]'},
  {direction_id:"d1",client_id:"c2",changes_json:'[{"field":"stage","to":"won"}]'},
  {direction_id:"d1",client_id:"c3",changes_json:'[{"field":"stage","to":"proposal"}]'}
 ];
 const result=buildObservedSalesFunnel({interactionRows:interactions,dealEventRows:events})[0];
 assert.equal(result.observed_contacted_clients,5);assert.equal(result.qualified_clients,3);assert.equal(result.won_clients,1);
 assert.equal(result.observed_contact_to_lead_percent,60);assert.equal(result.observed_lead_to_sale_percent,33.3);assert.equal(result.can_suggest,true);
});
test("does not offer recommendations with insufficient samples",()=>{
 const result=buildObservedSalesFunnel({interactionRows:[{direction_id:"d",client_id:"c1"}],dealEventRows:[]})[0];
 assert.equal(result.can_suggest,false);assert.equal(result.observed_contact_to_lead_percent,0);assert.equal(result.observed_lead_to_sale_percent,null);
});
test("ignores malformed event payloads and missing client references",()=>{
 const result=buildObservedSalesFunnel({interactionRows:[{direction_id:"d",client_id:null}],dealEventRows:[{direction_id:"d",client_id:"c1",changes_json:"bad"}]});
 assert.deepEqual(result,[]);
});

test("does not count stage changes outside the contacted-client cohort",()=>{
 const result=buildObservedSalesFunnel({interactionRows:[{direction_id:"d",client_id:"contacted"}],dealEventRows:[
  {direction_id:"d",client_id:"uncontacted",changes_json:'[{"field":"stage","to":"won"}]'}
 ]})[0];
 assert.equal(result.observed_contacted_clients,1);
 assert.equal(result.qualified_clients,0);
 assert.equal(result.won_clients,0);
 assert.equal(result.observed_contact_to_lead_percent,0);
});

test("ignores deal stage transitions that happened before the first recorded contact",()=>{
 const interactions=[
  {direction_id:"d",client_id:"old",first_contact_on:"2026-11-10"},
  {direction_id:"d",client_id:"new",first_contact_on:"2026-11-10"},
  {direction_id:"d",client_id:"later",first_contact_on:"2026-11-12"}
 ];
 const events=[
  {direction_id:"d",client_id:"old",created_at:"2026-11-09 12:00:00",changes_json:'[{"field":"stage","to":"won"}]'},
  {direction_id:"d",client_id:"new",created_at:"2026-11-10 12:00:00",changes_json:'[{"field":"stage","to":"proposal"}]'},
  {direction_id:"d",client_id:"later",created_at:"2026-11-13 12:00:00",changes_json:'[{"field":"stage","to":"won"}]'}
 ];
 const result=buildObservedSalesFunnel({interactionRows:interactions,dealEventRows:events})[0];
 assert.equal(result.observed_contacted_clients,3);
 assert.equal(result.qualified_clients,2);
 assert.equal(result.won_clients,1);
 assert.equal(result.observed_contact_to_lead_percent,66.7);
 assert.equal(result.observed_lead_to_sale_percent,50);
});
