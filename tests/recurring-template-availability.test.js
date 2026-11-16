import test from "node:test";
import assert from "node:assert/strict";
import { isRecurringTemplateAvailable } from "../functions/api/task-templates.js";

test("recurring templates stop generating tasks for inactive areas or directions",()=>{
  assert.equal(isRecurringTemplateAvailable({active:1}),true);
  assert.equal(isRecurringTemplateAvailable({active:1,life_area_id:"a1",life_area_active:1}),true);
  assert.equal(isRecurringTemplateAvailable({active:1,direction_id:"d1",direction_active:1}),true);
  assert.equal(isRecurringTemplateAvailable({active:1,life_area_id:"a1",life_area_active:0}),false);
  assert.equal(isRecurringTemplateAvailable({active:1,direction_id:"d1",direction_active:0}),false);
  assert.equal(isRecurringTemplateAvailable({active:0}),false);
});
