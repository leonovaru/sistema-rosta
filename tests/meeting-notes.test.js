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
