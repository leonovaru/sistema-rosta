import test from "node:test";
import assert from "node:assert/strict";
import { isCharityPersonAvailableForProject, isCharityPersonDeletionAllowed } from "../functions/api/charity.js";

test("charity transactions can use global contacts or contacts from the same project",()=>{
  assert.equal(isCharityPersonAvailableForProject({id:"global",project_id:null},"p1"),true);
  assert.equal(isCharityPersonAvailableForProject({id:"same",project_id:"p1"},"p1"),true);
  assert.equal(isCharityPersonAvailableForProject({id:"other",project_id:"p2"},"p1"),false);
  assert.equal(isCharityPersonAvailableForProject(null,"p1"),false);
});

test("charity contacts referenced by transactions cannot be deleted",()=>{
  assert.equal(isCharityPersonDeletionAllowed(false),true);
  assert.equal(isCharityPersonDeletionAllowed(true),false);
});
