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

export function calculateProjectWorkload(projects = [], today, capacity = null) {
  const active = projects.filter(project => ["active", "waiting"].includes(project.status));
  const workingDays = Array.isArray(capacity?.working_days) ? capacity.working_days : [];
  const configured = capacity?.configured === true && workingDays.length > 0 && Number(capacity.daily_capacity_minutes) > 0;
  const countWorkingDays = days => { let count=0; for(let i=0;i<days;i++){ const day=new Date(addDays(today,i)+"T12:00:00Z").getUTCDay(); const iso=day===0?7:day; if(workingDays.includes(iso)) count++; } return count; };
  const horizons = [7, 14, 30].map(days => {
    const limit = addDays(today, days);
    const due = active.filter(project => project.deadline && project.deadline >= today && project.deadline <= limit);
    const estimated_minutes=due.reduce((sum, project) => sum + Math.max(0, Number(project.open_estimated_minutes) || 0), 0);
    const gross_capacity_minutes=configured?countWorkingDays(days)*Number(capacity.daily_capacity_minutes):null;
    const calendar_busy_minutes=configured?Math.max(0,Number(capacity.calendar_busy_by_horizon?.[[7,14,30].indexOf(days)])||0):null;
    const capacity_minutes=configured?Math.max(0,gross_capacity_minutes-calendar_busy_minutes):null;
    return { days, projects: due.length, estimated_minutes, unestimated_tasks: due.reduce((sum, project) => sum + Math.max(0, Number(project.unestimated_open_tasks) || 0), 0), gross_capacity_minutes, calendar_busy_minutes, capacity_minutes, load_percent:capacity_minutes>0?Math.round(estimated_minutes/capacity_minutes*100):estimated_minutes>0?null:0, over_capacity:capacity_minutes!==null&&estimated_minutes>capacity_minutes };
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
  return { projects: enriched, horizons, capacity_configured:configured, working_days:workingDays, daily_capacity_minutes:configured?Number(capacity.daily_capacity_minutes):null };
}
