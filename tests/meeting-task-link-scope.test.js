import test from "node:test";
import assert from "node:assert/strict";
import { isMeetingTaskLinkCompatible } from "../functions/_lib/meeting-notes.js";

test("meeting task links respect explicit project and client scope",()=>{
  assert.equal(isMeetingTaskLinkCompatible({project_id:"p1",client_id:"c1"},{project_id:"p1",client_id:null,project_client_id:"c1"}),true);
  assert.equal(isMeetingTaskLinkCompatible({project_id:"p1"},{project_id:"p2"}),false);
  assert.equal(isMeetingTaskLinkCompatible({client_id:"c1"},{project_id:null,client_id:"c2"}),false);
  assert.equal(isMeetingTaskLinkCompatible({client_id:"c1"},{project_id:"p1",client_id:null,project_client_id:"c1"}),true);
  assert.equal(isMeetingTaskLinkCompatible({},{project_id:"p2",client_id:"c2"}),true);
});
