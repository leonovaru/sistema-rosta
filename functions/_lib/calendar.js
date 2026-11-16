import { resolveSleepWallTime } from "./sleep.js";

export function isValidCalendarDate(value) {
  if (typeof value !== "string" || !/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function isValidCalendarDateTime(value) {
  if (typeof value !== "string" || !/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$/.test(value)) return false;
  const [date, time] = value.split("T");
  const [hour, minute] = time.split(":").map(Number);
  return isValidCalendarDate(date) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

export function isValidCalendarRange(from, to, maxDays = 366) {
  if (!isValidCalendarDateTime(from) || !isValidCalendarDateTime(to) || to <= from) return false;
  const start = Date.parse(from + ":00Z");
  const end = Date.parse(to + ":00Z");
  return Number.isFinite(start) && Number.isFinite(end) && end - start <= maxDays * 86400000;
}

function shiftDate(date, days) {
  const value = new Date(date + "T12:00:00Z");
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0,10);
}
export function expandRecurringEvents(rows, from, to) {
  const fromDate = from.slice(0,10), toDate = to.slice(0,10);
  const expanded = [];
  for (const row of rows) {
    const baseStart = row.start_at.slice(0,10);
    const baseEnd = row.end_at.slice(0,10);
    const endOffsetDays = Math.round((Date.parse(baseEnd+"T00:00:00Z") - Date.parse(baseStart+"T00:00:00Z")) / 86400000);
    const rule = row.repeat_rule || "none";
    const dates = [];
    if (rule === "none") dates.push(baseStart);
    else {
      const until = row.repeat_until || toDate;
      const step = rule === "daily" ? 1 : 7;
      const daysBeforeRange = Math.floor((Date.parse(fromDate+"T00:00:00Z") - Date.parse(baseStart+"T00:00:00Z")) / 86400000);
      let offset = Math.max(0, daysBeforeRange - endOffsetDays);
      offset = Math.ceil(offset / step) * step;
      let date = shiftDate(baseStart, offset), guard = 0;
      while (date <= until && date <= toDate && guard++ < 500) {
        if (date >= fromDate || shiftDate(date, endOffsetDays) >= fromDate) dates.push(date);
        date = shiftDate(date, step);
      }
    }
    for (const date of dates) {
      const endDate = shiftDate(date, endOffsetDays);
      const startAt = date + row.start_at.slice(10);
      const endAt = endDate + row.end_at.slice(10);
      if (startAt >= to || endAt <= from) continue;
      const original = date === baseStart;
      expanded.push({
        ...row,
        id: row.id + (rule === "none" ? "" : "@" + date),
        series_id: row.id,
        series_start_at: row.start_at,
        series_end_at: row.end_at,
        start_at: startAt,
        end_at: endAt,
        actual_start_at: original ? row.actual_start_at : null,
        actual_end_at: original ? row.actual_end_at : null,
        occurrence_date: date
      });
    }
  }
  return expanded.sort((a,b) => a.start_at.localeCompare(b.start_at));
}

function formatCalendarWallTime(epoch, timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date(epoch));
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return value.year + "-" + value.month + "-" + value.day + "T" + value.hour + ":" + value.minute;
}

export function createSleepCalendarEvents(sessions = [], from, to, timezone = "Europe/Moscow", manualEvents = []) {
  const events = [];
  for (const session of sessions) {
    if (!session.fell_asleep_at || !session.woke_at) continue;
    const startEpoch = resolveSleepWallTime(session.fell_asleep_at, session.asleep_timezone || session.timezone || timezone);
    const endEpoch = resolveSleepWallTime(session.woke_at, session.wake_timezone || session.timezone || timezone);
    if (startEpoch === null || endEpoch === null || endEpoch <= startEpoch) continue;
    const startAt = formatCalendarWallTime(startEpoch, timezone);
    const endAt = formatCalendarWallTime(endEpoch, timezone);
    if (startAt >= to || endAt <= from) continue;
    const duplicate = manualEvents.some(event => event.event_type === "sleep" &&
      event.status !== "cancelled" && event.start_at < endAt && event.end_at > startAt);
    if (duplicate) continue;
    events.push({
      id: "sleep-session-" + session.id,
      title: "Сон",
      event_type: "sleep",
      mode: "none",
      start_at: startAt,
      end_at: endAt,
      actual_start_at: null,
      actual_end_at: null,
      status: "completed",
      repeat_rule: "none",
      repeat_until: null,
      location: "",
      notes: session.note || "",
      is_sleep_session: true,
      sleep_session_id: session.id
    });
  }
  return events.sort((a, b) => a.start_at.localeCompare(b.start_at));
}
