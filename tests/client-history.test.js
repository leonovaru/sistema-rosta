import test from "node:test";
import assert from "node:assert/strict";
import {isValidHistoryDate,normalizeInteraction} from "../functions/_lib/client-history.js";

test("client history dates validate real calendar days",()=>{
 assert.equal(isValidHistoryDate("2026-11-15"),true);
 assert.equal(isValidHistoryDate("2026-02-30"),false);
 assert.equal(isValidHistoryDate("15.11.2026"),false);
});
test("interaction normalization bounds fields and keeps supported types",()=>{
 assert.deepEqual(normalizeInteraction({type:"call",title:"  Созвон  ",body:"  Обсудили сроки  ",occurred_on:"2026-11-15"}),{type:"call",title:"Созвон",body:"Обсудили сроки",occurred_on:"2026-11-15"});
 assert.equal(normalizeInteraction({type:"unknown",title:"Заметка"}).type,"note");
 assert.equal(normalizeInteraction({title:"x".repeat(250)}).title.length,180);
});
