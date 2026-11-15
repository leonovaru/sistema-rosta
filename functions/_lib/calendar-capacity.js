import { expandRecurringEvents } from "./calendar.js";

const EXCLUDED_TYPES = new Set(["sleep","work"]);

export function calculateCalendarBusyMinutes(events = [], fromDate, horizonDays, workingDays = []) {
  const allowed = new Set(workingDays.map(Number));
  let total = 0;
  for (let offset = 0; offset < horizonDays; offset++) {
    const date = new Date(fromDate + "T12:00:00Z");
    date.setUTCDate(date.getUTCDate() + offset);
    const day = date.getUTCDay() || 7;
    if (!allowed.has(day)) continue;
    const start = Date.parse(fromDate + "T00:00:00Z") + offset * 86400000;
    const end = start + 86400000;
    const intervals = [];
    for (const event of events) {
      if (event.status === "cancelled" || EXCLUDED_TYPES.has(event.event_type)) continue;
      const eventStart = Date.parse(String(event.start_at || "").replace(" ", "T") + (String(event.start_at || "").length === 16 ? ":00Z" : "Z"));
      const eventEnd = Date.parse(String(event.end_at || "").replace(" ", "T") + (String(event.end_at || "").length === 16 ? ":00Z" : "Z"));
      if (!Number.isFinite(eventStart) || !Number.isFinite(eventEnd)) continue;
      const left = Math.max(start, eventStart), right = Math.min(end, eventEnd);
      if (right > left) intervals.push([left, right]);
    }
    intervals.sort((a,b) => a[0]-b[0]);
    let mergedStart = null, mergedEnd = null;
    for (const [left,right] of intervals) {
      if (mergedStart === null) { mergedStart=left; mergedEnd=right; }
      else if (left <= mergedEnd) mergedEnd=Math.max(mergedEnd,right);
      else { total += Math.round((mergedEnd-mergedStart)/60000); mergedStart=left; mergedEnd=right; }
    }
    if (mergedStart !== null) total += Math.round((mergedEnd-mergedStart)/60000);
  }
  return total;
}

export { expandRecurringEvents };
