import test from "node:test";
import assert from "node:assert/strict";
import { allocateIncome, calculateBucketBalances, DEFAULT_INCOME_BUCKETS, normalizeBucketTitle } from "../functions/_lib/income-buckets.js";

test("default income buckets distribute exactly 100 percent",()=>{
  assert.equal(DEFAULT_INCOME_BUCKETS.reduce((sum,row)=>sum+row.percentage,0),100);
});

test("allocates each receipt by percentages and preserves cents",()=>{
  const buckets=[{id:"home",percentage:30},{id:"food",percentage:20},{id:"capital",percentage:50}];
  const rows=allocateIncome(1000.01,buckets);
  assert.deepEqual(rows.map(row=>row.amount),[300,200,500.01]);
  assert.equal(rows.reduce((sum,row)=>sum+row.amount,0),1000.01);
});

test("refuses to allocate when percentages do not total 100",()=>{
  assert.throws(()=>allocateIncome(100,[{id:"home",percentage:30},{id:"food",percentage:20}]),/100%/);
});

test("bucket balance is allocations minus only expenses assigned to that bucket",()=>{
  const rows=calculateBucketBalances(
    [{id:"food",title:"Питание",percentage:20},{id:"cats",title:"Коты",percentage:5}],
    [{bucket_id:"food",amount:200},{bucket_id:"cats",amount:50}],
    [{bucket_id:"food",amount:75},{bucket_id:"cats",amount:10},{bucket_id:null,amount:999}]
  );
  assert.equal(rows[0].balance,125);
  assert.equal(rows[1].balance,40);
  assert.equal(rows[0].spent,75);
});

test("income allocation recomputation preserves original bucket percentages when amount changes",()=>{
 const rows=allocateIncome(125,[{id:"home",percentage:30},{id:"food",percentage:20},{id:"capital",percentage:50}]);
 assert.deepEqual(rows.map(row=>row.amount),[37.5,25,62.5]);
 assert.equal(rows.reduce((sum,row)=>sum+row.amount,0),125);
});

test("bucket title normalization trims whitespace and preserves the requested title",()=>{
 assert.equal(normalizeBucketTitle("  Резерв  "),"Резерв");
});
test("bucket title normalization rejects empty and overly long titles",()=>{
 assert.throws(()=>normalizeBucketTitle(" "),/2 to 60/);
 assert.throws(()=>normalizeBucketTitle("x".repeat(61)),/2 to 60/);
});

test("bucket balances subtract funding transfers separately from expenses",()=>{
  const rows=calculateBucketBalances(
    [{id:"capital",title:"Капитал",percentage:100}],
    [{bucket_id:"capital",amount:500}],
    [{bucket_id:"capital",amount:100}],
    [{source_bucket_id:"capital",amount:150}]
  );
  assert.equal(rows[0].spent,100);
  assert.equal(rows[0].transferred,150);
  assert.equal(rows[0].balance,250);
});
