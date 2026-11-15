import test from "node:test";
import assert from "node:assert/strict";
import { buildMonthlyDealForecast } from "../functions/_lib/deal-forecast.js";
test("combines dated open deals and actual receipts by month without treating won deals as cash",()=>{
 const result=buildMonthlyDealForecast({dealRows:[{month:"2026-11",deal_count:2,planned_amount:50000,weighted_amount:25000}],incomeRows:[{month:"2026-11",actual_amount:12000},{month:"2026-12",actual_amount:8000}],undatedRow:{count:1,amount:15000}});
 assert.deepEqual(result.monthly_forecast,[{month:"2026-11",planned_amount:50000,weighted_amount:25000,deal_count:2,actual_amount:12000},{month:"2026-12",planned_amount:0,weighted_amount:0,deal_count:0,actual_amount:8000}]);
 assert.deepEqual(result.undated_open,{count:1,amount:15000});
});
test("ignores malformed month keys and negative amounts",()=>{
 const result=buildMonthlyDealForecast({dealRows:[{month:"bad",planned_amount:20},{month:"2026-11",planned_amount:-10,weighted_amount:4,deal_count:1}],incomeRows:[{month:"2026-11",actual_amount:-5}]});
 assert.deepEqual(result.monthly_forecast,[{month:"2026-11",planned_amount:0,weighted_amount:4,deal_count:1,actual_amount:0}]);
});

test("closed-client deals stay in history but are excluded from the active pipeline",async()=>{
 const {isDealInActivePipeline}=await import("../functions/_lib/deal-forecast.js");
 assert.equal(isDealInActivePipeline({stage:"proposal",client_status:"active"}),true);
 assert.equal(isDealInActivePipeline({stage:"proposal",client_status:"closed"}),false);
 assert.equal(isDealInActivePipeline({stage:"proposal",client_status:null}),true);
 assert.equal(isDealInActivePipeline({stage:"won",client_status:"active"}),false);
 assert.equal(isDealInActivePipeline({stage:"lost",client_status:"closed"}),false);
});
