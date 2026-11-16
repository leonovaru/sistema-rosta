import test from "node:test";
import assert from "node:assert/strict";
import { resolveDealDirection } from "../functions/api/deals.js";

test("deal direction follows its client and rejects conflicting attribution",()=>{
  assert.deepEqual(resolveDealDirection({direction_id:"d1"},"d1"),{ok:true,direction_id:"d1"});
  assert.deepEqual(resolveDealDirection({direction_id:"d1"},null),{ok:true,direction_id:"d1"});
  assert.deepEqual(resolveDealDirection(null,"d2"),{ok:true,direction_id:"d2"});
  assert.deepEqual(resolveDealDirection(null,null),{ok:true,direction_id:null});
  assert.deepEqual(resolveDealDirection({direction_id:"d1"},"d2"),{ok:false,direction_id:null});
});
