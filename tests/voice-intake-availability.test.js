import test from "node:test";
import assert from "node:assert/strict";
import { isProjectPlanSaveAllowed } from "../functions/api/projects/plan.js";
import { safeDate, isVoiceProjectSelectable } from "../functions/api/tasks/voice-intake.js";

test("project plan save is limited to active projects with selectable clients",()=>{
  assert.equal(isProjectPlanSaveAllowed({status:"active"}),true);
  assert.equal(isProjectPlanSaveAllowed({status:"draft"}),true);
  assert.equal(isProjectPlanSaveAllowed({status:"waiting"}),true);
  assert.equal(isProjectPlanSaveAllowed({status:"done"}),false);
  assert.equal(isProjectPlanSaveAllowed({status:"archived"}),false);
  assert.equal(isProjectPlanSaveAllowed({status:"active",client_id:"c1",client_status:"closed"}),false);
  assert.equal(isProjectPlanSaveAllowed({status:"active",client_id:"c1",client_status:"active"}),true);
});

test("voice intake rejects closed clients and inactive projects",()=>{
  assert.equal(isVoiceProjectSelectable({status:"active"}),true);
  assert.equal(isVoiceProjectSelectable({status:"archived"}),false);
  assert.equal(isVoiceProjectSelectable({status:"done"}),false);
  assert.equal(isVoiceProjectSelectable({status:"active",client_id:"c1",client_status:"closed"}),false);
  assert.equal(isVoiceProjectSelectable({status:"active",client_id:"c1",client_status:"active"}),true);
});

test("voice intake distinguishes missing dates from invalid calendar dates",()=>{
  assert.equal(safeDate(null),null);
  assert.equal(safeDate(""),null);
  assert.equal(safeDate("2024-02-29"),"2024-02-29");
  assert.equal(safeDate("2026-02-30"),undefined);
  assert.equal(safeDate("not-a-date"),undefined);
});
