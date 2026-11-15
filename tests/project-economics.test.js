import test from "node:test";
import assert from "node:assert/strict";
import {calculateProjectEconomics} from "../functions/_lib/project-economics.js";

test("project economics separates agreed value, receipts, direct costs and time",()=>{
 const x=calculateProjectEconomics({plannedRevenue:100000,received:60000,directExpenses:15000,minutes:900});
 assert.equal(x.outstanding,40000);
 assert.equal(x.contribution,45000);
 assert.equal(x.hours,15);
 assert.equal(x.revenue_per_hour,4000);
 assert.equal(x.contribution_per_hour,3000);
 assert.equal(x.status,"awaiting_payment");
});
test("project economics flags negative contribution and overspending",()=>{
 assert.equal(calculateProjectEconomics({received:10000,directExpenses:12000}).status,"loss");
 assert.equal(calculateProjectEconomics({plannedRevenue:5000,directExpenses:6000}).status,"over_budget");
});
test("missing history does not invent hourly metrics or margins",()=>{
 const x=calculateProjectEconomics({plannedRevenue:20000});
 assert.equal(x.revenue_per_hour,null);
 assert.equal(x.contribution_per_hour,null);
 assert.equal(x.margin_percent,null);
 assert.equal(x.outstanding,20000);
});
