import test from "node:test";
import assert from "node:assert/strict";
import { calculateCalendarBusyMinutes } from "../functions/_lib/calendar-capacity.js";
import { expandRecurringEvents } from "../functions/_lib/calendar.js";

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

test("includes recurring calendar commitments expanded into the selected horizon",()=>{
 const rows=[{id:"weekly-meeting",event_type:"meeting",status:"planned",start_at:"2026-11-09T10:00",end_at:"2026-11-09T11:00",repeat_rule:"weekly",repeat_until:"2026-11-30"}];
 const expanded=expandRecurringEvents(rows,"2026-11-16T00:00","2026-11-23T00:00");
 assert.equal(expanded.length,1);
 assert.equal(expanded[0].start_at,"2026-11-16T10:00");
 assert.equal(calculateCalendarBusyMinutes(expanded,"2026-11-16",7,[1,2,3,4,5]),60);
});
