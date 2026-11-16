import test from "node:test";
import assert from "node:assert/strict";
import { validateGoalFundingBucket } from "../functions/_lib/goal-funding.js";
const buckets=[{id:"food",active:1},{id:"old",active:0}];
test("accepts an active funding bucket",()=>assert.equal(validateGoalFundingBucket("food",buckets),"food"));
test("allows no funding bucket",()=>{assert.equal(validateGoalFundingBucket("",buckets),null);assert.equal(validateGoalFundingBucket(null,buckets),null);});
test("rejects archived or unknown funding buckets",()=>{assert.throws(()=>validateGoalFundingBucket("old",buckets),/активную корзину/);assert.throws(()=>validateGoalFundingBucket("other",buckets),/активную корзину/);});
test("rejects malformed bucket identifiers",()=>assert.throws(()=>validateGoalFundingBucket("x".repeat(101),buckets),/Некорректная корзина/));
