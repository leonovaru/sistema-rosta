import test from "node:test";
import assert from "node:assert/strict";
import { isProjectPlanSaveAllowed } from "../functions/api/projects/plan.js";
import { safeDate, isVoiceProjectSelectable, hasClosingProjectTaskConflict } from "../functions/api/tasks/voice-intake.js";

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

test("voice intake does not close a project while creating or updating its tasks",()=>{
  const closing=new Set(["p1"]);
  assert.equal(hasClosingProjectTaskConflict([{operation:"create",project_id:"p1"}],closing),true);
  assert.equal(hasClosingProjectTaskConflict([{operation:"create",project_id:"p2"}],closing),false);
  assert.equal(hasClosingProjectTaskConflict([{operation:"create",project_id:"p1"},{operation:"create",parent_index:0}],closing),true);
  assert.equal(hasClosingProjectTaskConflict([{operation:"create",project_id:null},{operation:"create",project_id:null,parent_index:0}],closing),false);
  assert.equal(hasClosingProjectTaskConflict([{operation:"update",target_task_id:"t1"}],closing,[{id:"t1",project_id:"p1"}]),true);
});
