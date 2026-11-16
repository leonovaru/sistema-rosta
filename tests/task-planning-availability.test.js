import test from "node:test";
import assert from "node:assert/strict";
import { isTaskAvailableForPlanning } from "../functions/_lib/task-planning-availability.js";
import { buildWeeklyWorkload } from "../functions/_lib/weekly-workload.js";

test("keeps ordinary and unlinked tasks available for planning",()=>{
 assert.equal(isTaskAvailableForPlanning({status:"todo"}),true);
 assert.equal(isTaskAvailableForPlanning({project_status:"active",client_status:"active"}),true);
 assert.equal(isTaskAvailableForPlanning({project_status:null,client_status:null}),true);
});

test("excludes tasks belonging to archived or completed projects and closed clients",()=>{
 assert.equal(isTaskAvailableForPlanning({project_status:"archived"}),false);
 assert.equal(isTaskAvailableForPlanning({project_status:"done"}),false);
 assert.equal(isTaskAvailableForPlanning({client_status:"closed"}),false);
 assert.equal(isTaskAvailableForPlanning({project_status:"active",project_client_status:"closed"}),false);
});

test("does not count archived workspace tasks in weekly planning or waiting counts",()=>{
 const week=buildWeeklyWorkload({
  today:"2026-11-16",workingDays:[1,2,3,4,5],dailyCapacityMinutes:240,configured:true,
  tasks:[
   {id:"active",title:"Активная",status:"todo",due_date:"2026-11-16",estimated_minutes:60,project_status:"active"},
   {id:"archived-project",title:"Архивный проект",status:"todo",due_date:"2026-11-16",estimated_minutes:120,project_status:"archived"},
   {id:"completed-project",title:"Завершённый проект",status:"todo",due_date:"2026-11-16",estimated_minutes:180,project_status:"done"},
   {id:"closed-client",title:"Закрытый клиент",status:"waiting",due_date:"2026-11-16",estimated_minutes:90,client_status:"closed"},
   {id:"closed-project-client",title:"Проект закрытого клиента",status:"todo",due_date:"2026-11-16",estimated_minutes:30,project_status:"active",project_client_status:"closed"}
  ]
 });
 assert.equal(week.summary.estimated_task_count,1);
 assert.equal(week.summary.estimated_task_minutes,60);
 assert.equal(week.summary.waiting_task_count,0);
 assert.deepEqual(week.days[0].tasks.map(task=>task.id),["active"]);
});
