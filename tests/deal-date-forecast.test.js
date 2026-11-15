import test from "node:test";
import assert from "node:assert/strict";
import { buildDealDateForecast } from "../functions/_lib/deal-date-forecast.js";
test("estimates missing close date from observed direction sales cycle with sufficient sample",()=>{
 const result=buildDealDateForecast([{id:"a",direction_id:"d",client_id:"c",expected_close_date:null,expected_payment_date:"2026-12-01"}],{cycleByDirection:new Map([["d",{avg_contact_to_won_days:12.5,contact_to_won_sample:4}]]),firstContactByClient:new Map([["d::c","2026-11-01"]])})[0];
 assert.equal(result.estimated_close_date,"2026-11-14");
 assert.equal(result.close_date_is_estimated,true);
 assert.equal(result.close_date_estimate_source,"observed_sales_cycle");
 assert.equal(result.expected_payment_date,"2026-12-01");
});
test("preserves manually entered close date and does not overwrite payment date",()=>{
 const result=buildDealDateForecast([{direction_id:"d",client_id:"c",expected_close_date:"2026-11-20",expected_payment_date:"2026-11-27"}],{cycleByDirection:new Map(),firstContactByClient:new Map()})[0];
 assert.equal(result.estimated_close_date,"2026-11-20");
 assert.equal(result.close_date_is_estimated,false);
 assert.equal(result.expected_payment_date,"2026-11-27");
});
test("does not invent a close date when sample or first contact is insufficient",()=>{
 const noSample=buildDealDateForecast([{direction_id:"d",client_id:"c"}],{cycleByDirection:new Map([["d",{avg_contact_to_won_days:10,contact_to_won_sample:2}]]),firstContactByClient:new Map([["d::c","2026-11-01"]])})[0];
 const noContact=buildDealDateForecast([{direction_id:"d",client_id:"c"}],{cycleByDirection:new Map([["d",{avg_contact_to_won_days:10,contact_to_won_sample:4}]]),firstContactByClient:new Map()})[0];
 assert.equal(noSample.estimated_close_date,null);
 assert.equal(noContact.estimated_close_date,null);
});

test("does not estimate close dates for won or lost deals",()=>{
 const deals=["won","lost"].map(stage=>({direction_id:"d",client_id:"c",stage,expected_close_date:null}));
 const result=buildDealDateForecast(deals,{cycleByDirection:new Map([["d",{avg_contact_to_won_days:10,contact_to_won_sample:4}]]),firstContactByClient:new Map([["d::c","2026-11-01"]])});
 assert.deepEqual(result.map(x=>x.estimated_close_date),[null,null]);
});
