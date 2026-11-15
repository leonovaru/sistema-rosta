export function mergeMinuteIntervals(intervals) {
  const sorted = (intervals || [])
    .filter(item => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start)
    .map(item => ({ start: Math.max(0, item.start), end: Math.min(1440, item.end) }))
    .filter(item => item.end > item.start)
    .sort((a, b) => a.start - b.start);
  const merged = [];
  for (const item of sorted) {
    const last = merged[merged.length - 1];
    if (last && item.start <= last.end) last.end = Math.max(last.end, item.end);
    else merged.push({ ...item });
  }
  return merged;
}

export function intersectMinuteIntervals(left, right) {
  const intersections = [];
  for (const a of mergeMinuteIntervals(left)) {
    for (const b of mergeMinuteIntervals(right)) {
      const start = Math.max(a.start, b.start);
      const end = Math.min(a.end, b.end);
      if (end > start) intersections.push({ start, end });
    }
  }
  return mergeMinuteIntervals(intersections);
}

export function allocateTaskSlots(items, intervals, date) {
  const slots = mergeMinuteIntervals(intervals);
  const scheduled = [];
  const unscheduled = [];
  for (const item of items || []) {
    const minutes = Math.round(Number(item.minutes));
    if (!Number.isFinite(minutes) || minutes <= 0) {
      unscheduled.push({ ...item, scheduled: false, schedule_note: "Не указана корректная длительность" });
      continue;
    }
    const slot = slots.find(candidate => candidate.end - candidate.start >= minutes);
    if (!slot) {
      unscheduled.push({ ...item, scheduled: false, schedule_note: "Нет непрерывного свободного окна такой длины" });
      continue;
    }
    const start = slot.start;
    const end = start + minutes;
    const toLocalDateTime = minute => {
      const value = new Date(date + "T00:00:00Z");
      value.setUTCMinutes(minute);
      return value.toISOString().slice(0, 16);
    };
    scheduled.push({
      ...item,
      scheduled: true,
      start_at: toLocalDateTime(start),
      end_at: toLocalDateTime(end)
    });
    slot.start = end;
  }
  scheduled.sort((a, b) => a.start_at.localeCompare(b.start_at));
  return { items: [...scheduled, ...unscheduled], scheduled_minutes: scheduled.reduce((sum, item) => sum + item.minutes, 0), unscheduled_count: unscheduled.length };
}
