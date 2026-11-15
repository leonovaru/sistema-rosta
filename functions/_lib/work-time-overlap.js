import { mergeMinuteIntervals } from "./planner-scheduling.js";

function localParts(epoch, timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date(epoch));
  return Object.fromEntries(parts.map(part => [part.type, part.value]));
}

export function taskTimeIntervalsForLocalDay(entries = [], today, timezone = "Europe/Moscow", now = Date.now()) {
  const intervals = [];
  for (const entry of entries) {
    const startEpoch = Date.parse(entry.started_at);
    const endEpoch = entry.ended_at ? Date.parse(entry.ended_at) : now;
    if (!Number.isFinite(startEpoch) || !Number.isFinite(endEpoch) || endEpoch <= startEpoch) continue;
    const start = localParts(startEpoch, timezone);
    const end = localParts(endEpoch, timezone);
    if (start.year + "-" + start.month + "-" + start.day > today ||
        end.year + "-" + end.month + "-" + end.day < today) continue;
    const startMinute = start.year + "-" + start.month + "-" + start.day < today ? 0 : Number(start.hour) * 60 + Number(start.minute);
    const endMinute = end.year + "-" + end.month + "-" + end.day > today ? 1440 : Number(end.hour) * 60 + Number(end.minute);
    if (endMinute > startMinute) intervals.push({ start: startMinute, end: endMinute });
  }
  return mergeMinuteIntervals(intervals);
}

export function calculateUnionWorkMinutes(calendarIntervals = [], trackedIntervals = []) {
  return mergeMinuteIntervals([...calendarIntervals, ...trackedIntervals])
    .reduce((sum, interval) => sum + interval.end - interval.start, 0);
}

export function localDateForInstant(value, timezone = "Europe/Moscow") {
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch)) return null;
  const parts = localParts(epoch, timezone);
  return parts.year + "-" + parts.month + "-" + parts.day;
}
