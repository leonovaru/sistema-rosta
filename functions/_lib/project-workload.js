function addDays(date, days) {
  const value = new Date(date + "T12:00:00Z");
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function businessDaysInclusive(from, to) {
  if (to < from) return 0;
  let count = 0;
  for (let cursor = from; cursor <= to; cursor = addDays(cursor, 1)) {
    const day = new Date(cursor + "T12:00:00Z").getUTCDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

export function calculateProjectWorkload(projects = [], today) {
  const active = projects.filter(project => ["active", "waiting"].includes(project.status));
  const horizons = [7, 14, 30].map(days => {
    const limit = addDays(today, days);
    const due = active.filter(project => project.deadline && project.deadline >= today && project.deadline <= limit);
    return {
      days,
      projects: due.length,
      estimated_minutes: due.reduce((sum, project) => sum + Math.max(0, Number(project.open_estimated_minutes) || 0), 0),
      unestimated_tasks: due.reduce((sum, project) => sum + Math.max(0, Number(project.unestimated_open_tasks) || 0), 0)
    };
  });
  const enriched = projects.map(project => {
    const deadline = project.deadline || null;
    const days = deadline ? Math.round((Date.parse(deadline + "T12:00:00Z") - Date.parse(today + "T12:00:00Z")) / 86400000) : null;
    const workdays = deadline && days >= 0 && ["active", "waiting"].includes(project.status) ? businessDaysInclusive(today, deadline) : null;
    const minutes = Math.max(0, Number(project.open_estimated_minutes) || 0);
    return {
      ...project,
      workload: {
        estimated_minutes: minutes,
        estimated_hours: Math.round(minutes / 60 * 100) / 100,
        unestimated_open_tasks: Math.max(0, Number(project.unestimated_open_tasks) || 0),
        days_to_deadline: days,
        workdays_to_deadline: workdays,
        required_hours_per_workday: workdays > 0 ? Math.round(minutes / 60 / workdays * 100) / 100 : null,
        estimate_complete: Number(project.unestimated_open_tasks || 0) === 0
      }
    };
  });
  return { projects: enriched, horizons };
}
