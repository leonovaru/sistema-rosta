import test from "node:test";
import assert from "node:assert/strict";
import { shouldResetMeetingTaskLinks } from "../functions/_lib/meeting-notes.js";

test("meeting task links are reset when their agreement or scope changes",()=>{
  const existing={project_id:"p1",client_id:"c1",agreements_json:JSON.stringify([{task:"Send proposal"}])};
  assert.equal(shouldResetMeetingTaskLinks(existing,{project_id:"p1",client_id:"c1",agreements:[{task:"Send proposal"}]}),false);
  assert.equal(shouldResetMeetingTaskLinks(existing,{project_id:"p2",client_id:"c1",agreements:[{task:"Send proposal"}]}),true);
  assert.equal(shouldResetMeetingTaskLinks(existing,{project_id:"p1",client_id:"c2",agreements:[{task:"Send proposal"}]}),true);
  assert.equal(shouldResetMeetingTaskLinks(existing,{project_id:"p1",client_id:"c1",agreements:[{task:"Prepare contract"}]}),true);
});
