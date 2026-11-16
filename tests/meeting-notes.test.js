import test from "node:test";
import assert from "node:assert/strict";
import { isValidMeetingDate, cleanMeetingItems, normalizeMeetingAgreements, normalizeMeetingLinks } from "../functions/_lib/meeting-notes.js";

test("meeting date validation rejects impossible calendar dates",()=>{
 assert.equal(isValidMeetingDate("2026-11-15"),true);
 assert.equal(isValidMeetingDate("2026-02-30"),false);
 assert.equal(isValidMeetingDate("15.11.2026"),false);
 assert.equal(isValidMeetingDate(""),false);
});

test("meeting lists trim empty items and enforce a bounded size",()=>{
 assert.deepEqual(cleanMeetingItems([" Решение ","",null,"Вопрос"]),["Решение","Вопрос"]);
 assert.equal(cleanMeetingItems(Array.from({length:25},(_,i)=>String(i))).length,20);
});

test("meeting agreements retain only valid dates and owned project/client references",()=>{
 const result=normalizeMeetingAgreements([
  {task:"Отправить предложение",assignee:"Марина",due_date:"2026-11-20",project_id:"p1",client_id:"c1"},
  {task:"Уточнить бюджет",due_date:"2026-02-30",project_id:"foreign",client_id:"foreign"},
  {task:""}
 ],new Set(["p1"]),new Set(["c1"]));
 assert.deepEqual(result,[
  {task:"Отправить предложение",assignee:"Марина",due_date:"2026-11-20",project_id:"p1",client_id:"c1"},
  {task:"Уточнить бюджет",assignee:null,due_date:null,project_id:null,client_id:null}
 ]);
});

test("meeting project determines its linked client and prevents contradictory attribution",()=>{
 const projects=[{id:"p1",client_id:"c1"},{id:"p2",client_id:null}];
 const clients=[{id:"c1"},{id:"c2"}];
 assert.deepEqual(normalizeMeetingLinks("p1","c2",projects,clients),{project_id:"p1",client_id:"c1"});
 assert.deepEqual(normalizeMeetingLinks("p2","c2",projects,clients),{project_id:"p2",client_id:"c2"});
 assert.deepEqual(normalizeMeetingLinks("foreign","c2",projects,clients),{project_id:null,client_id:"c2"});
 assert.deepEqual(normalizeMeetingLinks("p1",null,projects,clients),{project_id:"p1",client_id:"c1"});
});

import { summarizeMeetingFollowup } from "../functions/_lib/meeting-followup.js";

test("meeting follow-up summary counts pending, completed, overdue commitments and open questions",()=>{
 const summary=summarizeMeetingFollowup([
  {agreements:[
   {task_id:"t1",task_status:"done",due_date:"2026-11-01"},
   {task_id:"t2",task_status:"doing",task_due_date:"2026-11-10"},
   {task_id:"t3",task_status:"todo",due_date:"2026-11-20"},
   {task:"Задача без созданной задачи"}
  ],open_questions:["Уточнить бюджет","Согласовать дату"]},
  {agreements:[{task_id:"t4",task_status:"waiting",due_date:"2026-11-12"}],open_questions:[]}
 ],"2026-11-15");
 assert.deepEqual(summary,{agreements_total:5,linked_tasks:4,completed:1,overdue:2,pending:4,open_questions:2});
});

test("meeting follow-up summary does not mark undated commitments overdue",()=>{
 const summary=summarizeMeetingFollowup([{agreements:[{task_id:"t1",task_status:"todo"}],open_questions:[]}],"2026-11-15");
 assert.equal(summary.overdue,0);
 assert.equal(summary.pending,1);
});

import { listMeetingFollowups } from "../functions/_lib/meeting-followup.js";

test("outstanding meeting commitments include missing tasks and overdue flags but exclude completed",()=>{
 const items=listMeetingFollowups([
  {id:"m1",title:"Планирование",meeting_date:"2026-11-10",agreements:[
   {task:"Отправить смету",task_id:"t1",task_status:"doing",task_due_date:"2026-11-12"},
   {task:"Позвонить клиенту",task_id:"t2",task_status:"done",due_date:"2026-11-01"},
   {task:"Согласовать сроки",due_date:"2026-11-20"}
  ]}
 ],"2026-11-15");
 assert.equal(items.length,2);
 assert.equal(items[0].overdue,true);
 assert.equal(items[1].task_missing,true);
 assert.equal(items[1].overdue,false);
});

test("meeting agreements inherit the client of their selected project",()=>{
  const projects=[{id:"p1",client_id:"c1"},{id:"p2",client_id:null}];
  const result=normalizeMeetingAgreements([
    {task:"Prepare report",project_id:"p1",client_id:"c2"},
    {task:"Send invoice",project_id:"p2",client_id:"c2"}
  ],new Set(["p1","p2"]),new Set(["c1","c2"]),projects);
  assert.equal(result[0].client_id,"c1");
  assert.equal(result[1].client_id,"c2");
});
