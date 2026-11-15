import test from "node:test";
import assert from "node:assert/strict";
import { buildBucketRecommendations } from "../functions/_lib/bucket-recommendations.js";

const buckets=[
 {id:"home",title:"Жильё",percentage:30,bucket_type:"spending"},
 {id:"food",title:"Питание",percentage:20,bucket_type:"spending"},
 {id:"cats",title:"Коты",percentage:5,bucket_type:"spending"},
 {id:"capital",title:"Капитал",percentage:10,bucket_type:"capital"}
];

test("does not recommend changes before at least two income months",()=>{
 const result=buildBucketRecommendations(buckets,[{month:"2026-09",total:100000}],[],{historyMonths:3});
 assert.equal(result.ready,false);
});

test("recommends shares from three complete months and keeps at least ten percent for capital",()=>{
 const income=[{month:"2026-08",total:100000},{month:"2026-09",total:120000},{month:"2026-10",total:110000}];
 const spending=[
  {bucket_id:"home",total:90000},
  {bucket_id:"food",total:60000},
  {bucket_id:"cats",total:15000}
 ];
 const result=buildBucketRecommendations(buckets,income,spending,{historyMonths:3});
 assert.equal(result.ready,true);
 assert.equal(result.average_monthly_income,110000);
 assert.equal(result.buckets.find(x=>x.id==="capital").recommended_percentage,10);
 assert.equal(result.buckets.reduce((sum,x)=>sum+x.recommended_percentage,0),100);
 assert.ok(result.buckets.find(x=>x.id==="home").recommended_percentage<30);
});

test("retains current share for buckets without recorded spending",()=>{
 const income=[{month:"2026-08",total:100000},{month:"2026-09",total:100000}];
 const result=buildBucketRecommendations(buckets,income,[{bucket_id:"home",total:60000}],{historyMonths:3});
 assert.equal(result.buckets.find(x=>x.id==="cats").recommended_percentage,5);
});
