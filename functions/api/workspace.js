import { json, requireUser, readJson, newId } from "../_lib/auth.js";
import { calculateProjectEconomics, calculateClientEconomics } from "../_lib/project-economics.js";
import { calculateProjectWorkload } from "../_lib/project-workload.js";
import { calculateCalendarBusyMinutes, calculateCalendarBusyByDay } from "../_lib/calendar-capacity.js";
import { calculateProjectDailyLoad } from "../_lib/project-daily-load.js";
import { expandRecurringEvents } from "../_lib/calendar.js";

const DEFAULT_AREAS = [
  ["Дом","Уборка, порядок, бытовые задачи"],
  ["Покупки","Продукты, бытовые товары и другие покупки"],
  ["Коты","Кормление, уход, покупки и забота о котах"],
  ["Уход за собой","Ежедневный и регулярный уход"],
  ["Здоровье и отдых","Восстановление, сон, движение и отдых"],
  ["Личное развитие","Обучение, хобби и личные цели"]
];

function addCalendarDays(date,days){const d=new Date(date+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}

async function owned(env, table, id, userId) {
  if (!id) return true;
  return Boolean(await env.DB.prepare(`SELECT id FROM ${table} WHERE id=? AND user_id=?`).bind(id,userId).first());
}

export async function onRequestGet({request,env}) {
  const user=await requireUser(request,env);
  if(!user)return json({error:"Необходим вход"},401);
  const settings=await env.DB.prepare("SELECT timezone,daily_capacity_minutes,work_capacity_configured,working_days_json FROM settings WHERE user_id=?").bind(user.id).first();
  const today=new Intl.DateTimeFormat("en-CA",{timeZone:settings?.timezone||"Europe/Moscow",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const count=await env.DB.prepare("SELECT COUNT(*) AS n FROM life_areas WHERE user_id=?").bind(user.id).first();
  if(!Number(count?.n||0)) {
    await env.DB.batch(DEFAULT_AREAS.map(([title,description],i)=>env.DB.prepare(
      "INSERT OR IGNORE INTO life_areas (id,user_id,title,description,sort_order) VALUES (?,?,?,?,?)"
    ).bind(newId(),user.id,title,description,i)));
  }
  const calendarFrom=today+"T00:00",calendarTo=addCalendarDays(today,30)+"T00:00";
  const [clients,projects,areas,directions,activityEvents,calendarRows]=await Promise.all([
    env.DB.prepare(`SELECT c.*,d.title AS direction_title,
      (SELECT COUNT(*) FROM projects p WHERE p.client_id=c.id AND p.user_id=c.user_id) AS project_count,
      (SELECT COUNT(*) FROM projects p WHERE p.client_id=c.id AND p.user_id=c.user_id AND p.status IN ('active','waiting')) AS active_projects,
      (SELECT COUNT(*) FROM tasks t WHERE t.user_id=c.user_id AND t.status!='done' AND (t.client_id=c.id OR t.project_id IN (SELECT p.id FROM projects p WHERE p.client_id=c.id AND p.user_id=c.user_id))) AS open_tasks,
      (SELECT COUNT(*) FROM tasks t WHERE t.user_id=c.user_id AND t.status!='done' AND t.due_date IS NOT NULL AND t.due_date<? AND (t.client_id=c.id OR t.project_id IN (SELECT p.id FROM projects p WHERE p.client_id=c.id AND p.user_id=c.user_id))) AS overdue_tasks,
      (SELECT COALESCE(SUM(MAX(0,COALESCE(p.budget,0)-(SELECT COALESCE(SUM(i.amount),0) FROM income_entries i WHERE i.user_id=p.user_id AND i.project_id=p.id))),0) FROM projects p WHERE p.client_id=c.id AND p.user_id=c.user_id AND p.status NOT IN ('done','archived')) AS outstanding_payment,
      (SELECT COALESCE(SUM(i.amount),0) FROM income_entries i WHERE i.user_id=c.user_id AND (i.client_id=c.id OR i.project_id IN (SELECT p.id FROM projects p WHERE p.client_id=c.id AND p.user_id=c.user_id))) AS revenue_total,
      (SELECT COALESCE(SUM(e.amount),0) FROM expenses e WHERE e.user_id=c.user_id AND (e.client_id=c.id OR e.project_id IN (SELECT p.id FROM projects p WHERE p.client_id=c.id AND p.user_id=c.user_id))) AS direct_expenses_total,
      (SELECT COALESCE(SUM(te.duration_minutes),0) FROM task_time_entries te JOIN tasks t ON t.id=te.task_id AND t.user_id=te.user_id WHERE te.user_id=c.user_id AND te.ended_at IS NOT NULL AND (t.client_id=c.id OR t.project_id IN (SELECT p.id FROM projects p WHERE p.client_id=c.id AND p.user_id=c.user_id))) AS tracked_minutes,
      (SELECT COALESCE(SUM(t.estimated_minutes),0) FROM tasks t WHERE t.user_id=c.user_id AND t.status!='done' AND (t.client_id=c.id OR t.project_id IN (SELECT p.id FROM projects p WHERE p.client_id=c.id AND p.user_id=c.user_id))) AS open_estimated_minutes,
      (SELECT MIN(p.deadline) FROM projects p WHERE p.client_id=c.id AND p.user_id=c.user_id AND p.status IN ('active','waiting') AND p.deadline>=?) AS next_deadline,
      (SELECT COUNT(*) FROM projects p WHERE p.client_id=c.id AND p.user_id=c.user_id AND p.status IN ('active','waiting') AND p.deadline<?) AS overdue_project_deadlines,
      (SELECT COUNT(*) FROM projects p WHERE p.client_id=c.id AND p.user_id=c.user_id AND p.status IN ('active','waiting') AND p.deadline>=? AND p.deadline<=date(?,'+7 days')) AS upcoming_project_deadlines,
      (SELECT COUNT(*) FROM projects p WHERE p.client_id=c.id AND p.user_id=c.user_id AND p.status IN ('active','waiting') AND datetime((SELECT MAX(activity_at) FROM (
        SELECT p.updated_at AS activity_at
        UNION ALL SELECT MAX(COALESCE(t.completed_at,t.created_at)) FROM tasks t WHERE t.project_id=p.id AND t.user_id=p.user_id
        UNION ALL SELECT MAX(m.meeting_date) FROM meeting_notes m WHERE m.project_id=p.id AND m.user_id=p.user_id
        UNION ALL SELECT MAX(ci.occurred_on) FROM client_interactions ci WHERE ci.project_id=p.id AND ci.user_id=p.user_id
      )))<datetime('now','-14 days')) AS stale_projects,
      (SELECT MAX(activity_date) FROM (
        SELECT ci.occurred_on AS activity_date FROM client_interactions ci WHERE ci.user_id=c.user_id AND ci.client_id=c.id
        UNION ALL SELECT mn.meeting_date FROM meeting_notes mn WHERE mn.user_id=c.user_id AND mn.client_id=c.id
        UNION ALL SELECT substr(t.completed_at,1,10) FROM tasks t WHERE t.user_id=c.user_id AND t.status='done' AND (t.client_id=c.id OR t.project_id IN (SELECT p.id FROM projects p WHERE p.client_id=c.id AND p.user_id=c.user_id))
      )) AS last_activity
      FROM clients c LEFT JOIN directions d ON d.id=c.direction_id WHERE c.user_id=? ORDER BY c.updated_at DESC`).bind(today,today,today,today,today,user.id).all(),
    env.DB.prepare(`SELECT p.*,c.name AS client_name,d.title AS direction_title,
      (SELECT MAX(activity_at) FROM (
        SELECT p.updated_at AS activity_at
        UNION ALL SELECT MAX(COALESCE(t.completed_at,t.created_at)) FROM tasks t WHERE t.project_id=p.id AND t.user_id=p.user_id
        UNION ALL SELECT MAX(m.meeting_date) FROM meeting_notes m WHERE m.project_id=p.id AND m.user_id=p.user_id
        UNION ALL SELECT MAX(ci.occurred_on) FROM client_interactions ci WHERE ci.project_id=p.id AND ci.user_id=p.user_id
      )) AS last_activity_at,(SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id AND t.user_id=p.user_id AND t.status!='done') AS open_tasks,(SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id AND t.user_id=p.user_id) AS total_tasks,(SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id AND t.user_id=p.user_id AND t.status='done') AS done_tasks,(SELECT COALESCE(SUM(CASE WHEN t.status!='done' THEN MAX(0,COALESCE(t.estimated_minutes,0)) ELSE 0 END),0) FROM tasks t WHERE t.project_id=p.id AND t.user_id=p.user_id) AS open_estimated_minutes,(SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id AND t.user_id=p.user_id AND t.status!='done' AND (t.estimated_minutes IS NULL OR t.estimated_minutes<=0)) AS unestimated_open_tasks,(SELECT COALESCE(SUM(i.amount),0) FROM income_entries i WHERE i.user_id=p.user_id AND i.project_id=p.id) AS received_total,(SELECT COALESCE(SUM(e.amount),0) FROM expenses e WHERE e.user_id=p.user_id AND e.project_id=p.id) AS direct_expenses,(SELECT COALESCE(SUM(COALESCE(te.duration_minutes,CAST((julianday(te.ended_at)-julianday(te.started_at))*1440 AS INTEGER))),0) FROM task_time_entries te JOIN tasks tt ON tt.id=te.task_id AND tt.user_id=te.user_id WHERE te.user_id=p.user_id AND tt.project_id=p.id AND te.ended_at IS NOT NULL) AS tracked_minutes FROM projects p LEFT JOIN clients c ON c.id=p.client_id LEFT JOIN directions d ON d.id=p.direction_id WHERE p.user_id=? ORDER BY CASE p.status WHEN 'active' THEN 0 WHEN 'waiting' THEN 1 WHEN 'draft' THEN 2 ELSE 3 END,p.deadline`).bind(user.id).all(),
    env.DB.prepare("SELECT * FROM life_areas WHERE user_id=? AND active=1 ORDER BY sort_order,title").bind(user.id).all(),
    env.DB.prepare("SELECT id,title FROM directions WHERE user_id=? AND active=1 ORDER BY sort_order").bind(user.id).all(),
    env.DB.prepare(`SELECT activity_type,activity_date FROM (
      SELECT 'interaction' AS activity_type,occurred_on AS activity_date FROM client_interactions WHERE user_id=?
      UNION ALL SELECT 'meeting',meeting_date FROM meeting_notes WHERE user_id=?
      UNION ALL SELECT 'task' ,substr(completed_at,1,10) FROM tasks WHERE user_id=? AND status='done' AND completed_at IS NOT NULL
    ) WHERE activity_date>=date(?,'-29 days') AND activity_date<=? `).bind(user.id,user.id,user.id,today,today).all(),
    env.DB.prepare("SELECT * FROM calendar_events WHERE user_id=? AND status='planned' AND ((start_at<? AND end_at>?) OR (repeat_rule!='none' AND start_at<? AND repeat_until>=?))").bind(user.id,calendarTo,calendarFrom,calendarTo,today).all()
  ]);
  const activitySummary={week:{interactions:0,meetings:0,tasks_completed:0},month:{interactions:0,meetings:0,tasks_completed:0}};
  for(const event of activityEvents.results){
    const key=event.activity_type==="interaction"?"interactions":event.activity_type==="meeting"?"meetings":"tasks_completed";
    activitySummary.month[key]++;
    if(event.activity_date>=new Date(new Date(today+"T12:00:00Z").getTime()-6*86400000).toISOString().slice(0,10))activitySummary.week[key]++;
  }
  activitySummary.week.total=activitySummary.week.interactions+activitySummary.week.meetings+activitySummary.week.tasks_completed;
  activitySummary.month.total=activitySummary.month.interactions+activitySummary.month.meetings+activitySummary.month.tasks_completed;
  let workingDays=[]; try { workingDays=JSON.parse(settings?.working_days_json||'[]'); } catch {}
  const expandedCalendar=expandRecurringEvents(calendarRows.results,calendarFrom,calendarTo);
  const calendarBusyByDay=calculateCalendarBusyByDay(expandedCalendar,today,30,workingDays);
  const calendarBusyByHorizon=[7,14,30].map(days=>calendarBusyByDay.slice(0,days).reduce((sum,d)=>sum+d.busy_minutes,0));
  const capacityConfig={configured:Number(settings?.work_capacity_configured)===1,working_days:workingDays,daily_capacity_minutes:settings?.daily_capacity_minutes,calendar_busy_by_horizon:calendarBusyByHorizon};
  const workload=calculateProjectWorkload(projects.results,today,capacityConfig);
  const dailyLoad=calculateProjectDailyLoad(projects.results,today,capacityConfig,calendarBusyByDay);
  return json({today,client_activity_summary:activitySummary,clients:clients.results.map(client=>({...client,economics:calculateClientEconomics({revenue:client.revenue_total,directExpenses:client.direct_expenses_total,trackedMinutes:client.tracked_minutes})})),project_daily_load:dailyLoad,project_workload_summary:workload.horizons,work_capacity:{configured:workload.capacity_configured,working_days:workload.working_days,daily_capacity_minutes:workload.daily_capacity_minutes},projects:workload.projects.map(p=>({...p,economics:calculateProjectEconomics({plannedRevenue:p.budget,plannedCosts:p.cost_budget,received:p.received_total,directExpenses:p.direct_expenses,minutes:p.tracked_minutes})})),life_areas:areas.results,directions:directions.results});
}

export async function onRequestPost({request,env}) {
  const user=await requireUser(request,env);
  if(!user)return json({error:"Необходим вход"},401);
  const b=await readJson(request)||{};
  const type=String(b.type||"");
  const id=newId();
  if(type==="client") {
    const name=String(b.name||"").trim();
    const directionId=b.direction_id?String(b.direction_id):null;
    if(!name||name.length>160)return json({error:"Укажи название клиента (до 160 символов)"},400);
    if(!(await owned(env,"directions",directionId,user.id)))return json({error:"Направление не найдено"},404);
    await env.DB.prepare("INSERT INTO clients (id,user_id,direction_id,name,contact,status,notes) VALUES (?,?,?,?,?,?,?)")
      .bind(id,user.id,directionId,name,String(b.contact||"").slice(0,240),["lead","active","paused","closed"].includes(b.status)?b.status:"active",String(b.notes||"").slice(0,3000)).run();
    return json({ok:true,id},201);
  }
  if(type==="project") {
    const title=String(b.title||"").trim(),clientId=b.client_id?String(b.client_id):null,directionId=b.direction_id?String(b.direction_id):null;
    if(!title||title.length>180)return json({error:"Укажи название проекта (до 180 символов)"},400);
    if(!(await owned(env,"clients",clientId,user.id))||!(await owned(env,"directions",directionId,user.id)))return json({error:"Клиент или направление не найдены"},404);
    const client=clientId?await env.DB.prepare("SELECT direction_id FROM clients WHERE id=? AND user_id=?").bind(clientId,user.id).first():null;
    if(client?.direction_id&&directionId&&client.direction_id!==directionId)return json({error:"Проект должен относиться к направлению выбранного клиента"},400);
    const finalDirectionId=directionId||client?.direction_id||null;
    const deadline=b.deadline?String(b.deadline):null;
    if(deadline&&!/^\d{4}-\d{2}-\d{2}$/.test(deadline))return json({error:"Проверь дату завершения"},400);
    await env.DB.prepare("INSERT INTO projects (id,user_id,client_id,direction_id,title,description,expected_result,deadline,budget,cost_budget,status) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id,user.id,clientId,finalDirectionId,title,String(b.description||"").slice(0,5000),String(b.expected_result||"").slice(0,2000),deadline,Math.max(0,Number(b.budget)||0),Math.max(0,Number(b.cost_budget)||0),["draft","active","waiting","done","archived"].includes(b.status)?b.status:"active").run();
    return json({ok:true,id},201);
  }
  if(type==="life_area") {
    const title=String(b.title||"").trim();
    if(!title||title.length>100)return json({error:"Укажи название области (до 100 символов)"},400);
    try {
      await env.DB.prepare("INSERT INTO life_areas (id,user_id,title,description,sort_order) VALUES (?,?,?,?,?)")
        .bind(id,user.id,title,String(b.description||"").slice(0,1000),Number(b.sort_order)||50).run();
    } catch { return json({error:"Такая область уже существует"},409); }
    return json({ok:true,id},201);
  }
  return json({error:"Неизвестный тип записи"},400);
}

export async function onRequestPatch({request,env}) {
  const user=await requireUser(request,env);
  if(!user)return json({error:"Необходим вход"},401);
  const b=await readJson(request)||{},id=String(b.id||""),type=String(b.type||"");
  if(!id)return json({error:"Не выбрана запись"},400);
  if(type==="client") {
    const name=String(b.name||"").trim();
    if(!name||name.length>160)return json({error:"Проверь название клиента"},400);
    const r=await env.DB.prepare("UPDATE clients SET name=?,contact=?,status=?,notes=?,updated_at=datetime('now') WHERE id=? AND user_id=?")
      .bind(name,String(b.contact||"").slice(0,240),["lead","active","paused","closed"].includes(b.status)?b.status:"active",String(b.notes||"").slice(0,3000),id,user.id).run();
    if(!r.meta.changes)return json({error:"Клиент не найден"},404);
  } else if(type==="project") {
    const title=String(b.title||"").trim();
    if(!title||title.length>180)return json({error:"Проверь название проекта"},400);
    const r=await env.DB.prepare("UPDATE projects SET title=?,description=?,expected_result=?,deadline=?,budget=?,cost_budget=?,status=?,updated_at=datetime('now') WHERE id=? AND user_id=?")
      .bind(title,String(b.description||"").slice(0,5000),String(b.expected_result||"").slice(0,2000),b.deadline||null,Math.max(0,Number(b.budget)||0),Math.max(0,Number(b.cost_budget)||0),["draft","active","waiting","done","archived"].includes(b.status)?b.status:"active",id,user.id).run();
    if(!r.meta.changes)return json({error:"Проект не найден"},404);
  } else if(type==="life_area") {
    const title=String(b.title||"").trim();
    if(!title||title.length>100)return json({error:"Проверь название области"},400);
    const r=await env.DB.prepare("UPDATE life_areas SET title=?,description=? WHERE id=? AND user_id=?")
      .bind(title,String(b.description||"").slice(0,1000),id,user.id).run();
    if(!r.meta.changes)return json({error:"Область не найдена"},404);
  } else return json({error:"Неизвестный тип записи"},400);
  return json({ok:true});
}

export async function onRequestDelete({request,env}) {
  const user=await requireUser(request,env);
  if(!user)return json({error:"Необходим вход"},401);
  const b=await readJson(request)||{},id=String(b.id||""),type=String(b.type||"");
  const tables={client:"clients",project:"projects",life_area:"life_areas"};
  const table=tables[type];
  if(!table||!id)return json({error:"Некорректный запрос"},400);
  if(type==="life_area") {
    const r=await env.DB.prepare("UPDATE life_areas SET active=0 WHERE id=? AND user_id=?").bind(id,user.id).run();
    if(!r.meta.changes)return json({error:"Область не найдена"},404);
  } else {
    const r=await env.DB.prepare(`DELETE FROM ${table} WHERE id=? AND user_id=?`).bind(id,user.id).run();
    if(!r.meta.changes)return json({error:"Запись не найдена"},404);
  }
  return json({ok:true});
}
