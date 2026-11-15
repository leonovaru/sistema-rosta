import test from "node:test";
import assert from "node:assert/strict";
import { calculateCalendarBusyMinutes } from "../functions/_lib/calendar-capacity.js";

test("counts planned events on configured workdays and merges overlaps",()=>{
 const events=[
  {event_type:"meeting",status:"planned",start_at:"2026-11-16T10:00",end_at:"2026-11-16T11:00"},
  {event_type:"travel",status:"planned",start_at:"2026-11-16T10:30",end_at:"2026-11-16T12:00"},
  {event_type:"personal",status:"planned",start_at:"2026-11-17T13:00",end_at:"2026-11-17T14:30"}
 ];
 assert.equal(calculateCalendarBusyMinutes(events,"2026-11-16",7,[1,2,3,4,5]),210);
});
test("ignores sleep, work blocks, cancelled events and non-working days",()=>{
 const events=[
  {event_type:"sleep",status:"planned",start_at:"2026-11-16T00:00",end_at:"2026-11-16T08:00"},
  {event_type:"work",status:"planned",start_at:"2026-11-16T09:00",end_at:"2026-11-16T12:00"},
  {event_type:"meeting",status:"cancelled",start_at:"2026-11-16T12:00",end_at:"2026-11-16T13:00"},
  {event_type:"hobby",status:"planned",start_at:"2026-11-21T10:00",end_at:"2026-11-21T12:00"}
 ];
 assert.equal(calculateCalendarBusyMinutes(events,"2026-11-16",7,[1,2,3,4,5]),0);
});
test("clips multi-day events to each selected workday",()=>{
 const events=[{event_type:"travel",status:"planned",start_at:"2026-11-16T22:00",end_at:"2026-11-17T02:00"}];
 assert.equal(calculateCalendarBusyMinutes(events,"2026-11-16",7,[1,2,3,4,5]),240);
});
