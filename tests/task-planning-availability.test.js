import test from "node:test";
import assert from "node:assert/strict";
import { isTaskAvailableForPlanning } from "../functions/_lib/task-planning-availability.js";

test("keeps ordinary and unlinked tasks available for planning",()=>{
 assert.equal(isTaskAvailableForPlanning({status:"todo"}),true);
 assert.equal(isTaskAvailableForPlanning({project_status:"active",client_status:"active"}),true);
 assert.equal(isTaskAvailableForPlanning({project_status:null,client_status:null}),true);
});

test("excludes tasks belonging to archived projects or closed clients",()=>{
 assert.equal(isTaskAvailableForPlanning({project_status:"archived"}),false);
 assert.equal(isTaskAvailableForPlanning({client_status:"closed"}),false);
 assert.equal(isTaskAvailableForPlanning({project_status:"active",project_client_status:"closed"}),false);
});
