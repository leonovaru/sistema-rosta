import test from "node:test";
import assert from "node:assert/strict";
import { calculateProjectDailyLoad } from "../functions/_lib/project-daily-load.js";
import { calculateCalendarBusyByDay } from "../functions/_lib/calendar-capacity.js";

test("distributes estimated project effort across working days before each deadline",()=>{
 const calendar=calculateCalendarBusyByDay([{event_type:"meeting",status:"planned",start_at:"2026-11-16T10:00",end_at:"2026-11-16T11:00"}],"2026-11-16",30,[1,2,3,4,5]);
 const result=calculateProjectDailyLoad([{id:"p",title:"Проект",status:"active",deadline:"2026-11-17",open_estimated_minutes:600}],"2026-11-16",{configured:true,working_days:[1,2,3,4,5],daily_capacity_minutes:360},calendar);
 assert.equal(result.days[0].planned_minutes,300);
 assert.equal(result.days[0].available_minutes,300);
 assert.equal(result.days[1].planned_minutes,300);
 assert.equal(result.overloaded_days,0);
});

test("flags days where distributed project demand exceeds net capacity",()=>{
 const result=calculateProjectDailyLoad([{id:"p",title:"Большой проект",status:"active",deadline:"2026-11-16",open_estimated_minutes:420}],"2026-11-16",{configured:true,working_days:[1,2,3,4,5],daily_capacity_minutes:360},[]);
 assert.equal(result.overloaded_days,1);
 assert.equal(result.days[0].overloaded,true);
 assert.equal(result.days[0].load_percent,117);
});

test("does not invent capacity before the user configures a work schedule",()=>{
 const result=calculateProjectDailyLoad([{id:"p",status:"active",deadline:"2026-11-16",open_estimated_minutes:600}],"2026-11-16",{configured:false,working_days:[1,2,3,4,5],daily_capacity_minutes:360},[]);
 assert.equal(result.configured,false);
 assert.deepEqual(result.days,[]);
});

test("keeps projects without deadlines visible as unallocated workload",()=>{
 const result=calculateProjectDailyLoad([{id:"p",status:"active",deadline:null,open_estimated_minutes:120}],"2026-11-16",{configured:true,working_days:[1,2,3,4,5],daily_capacity_minutes:360},[]);
 assert.equal(result.projects_without_deadline,1);
 assert.equal(result.days.length,0);
});
