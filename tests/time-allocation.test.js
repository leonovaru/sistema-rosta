import test from "node:test";
import assert from "node:assert/strict";
import { buildTimeAllocationRecommendations } from "../functions/_lib/time-allocation.js";
const direction=(id,contributionPerHour,overrides={})=>({direction_id:id,direction_title:id,contribution_per_hour:contributionPerHour,hours:10,revenue:50000,contribution:40000,observed_lead_to_sale_percent:20,qualified_clients:5,won_clients:5,avg_contact_to_won_days:20,contact_to_won_sample:5,...overrides});
test("allocates additional hours proportionally to evidence-adjusted contribution per hour",()=>{
 const result=buildTimeAllocationRecommendations([direction("a",4000),direction("b",2000),direction("c",1000)],12);
 assert.equal(result.recommendations.length,3);
 assert.equal(result.recommendations[0].direction_id,"a");
 assert.equal(result.recommendations[0].recommended_hours,6.9);
 assert.equal(result.recommendations.reduce((sum,x)=>sum+x.recommended_hours,0),12);
});
test("limits suggestions to three directions and excludes unproven or negative contributions",()=>{
 const result=buildTimeAllocationRecommendations([direction("a",1000),direction("b",900),direction("c",800),direction("d",700),direction("e",-100),direction("f",0,{hours:0})],5);
 assert.equal(result.recommendations.length,3);
 assert.deepEqual(result.recommendations.map(x=>x.direction_id),["a","b","c"]);
 assert.equal(result.excluded_directions.length,2);
});
test("does not claim strong confidence when sales sample is small",()=>{
 const result=buildTimeAllocationRecommendations([direction("a",3000,{qualified_clients:1,won_clients:1,contact_to_won_sample:1,avg_contact_to_won_days:null})],4);
 assert.equal(result.recommendations[0].confidence,"предварительная");
 assert.match(result.recommendations[0].allocation_reasons[1],/не подтверждена/);
});
test("rejects invalid additional hours",()=>{
 assert.throws(()=>buildTimeAllocationRecommendations([],0),/от 1 до 80/);
 assert.throws(()=>buildTimeAllocationRecommendations([],81),/от 1 до 80/);
});
test("returns no allocation when all directions lack reliable positive hourly contribution",()=>{
 const result=buildTimeAllocationRecommendations([direction("a",null),direction("b",-100)],6);
 assert.deepEqual(result.recommendations,[]);
});
