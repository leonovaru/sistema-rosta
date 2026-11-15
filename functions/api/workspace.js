import { json, requireUser, readJson, newId } from "../_lib/auth.js";

const DEFAULT_AREAS = [
  ["Дом","Уборка, порядок, бытовые задачи"],
  ["Покупки","Продукты, бытовые товары и другие покупки"],
  ["Коты","Кормление, уход, покупки и забота о котах"],
  ["Уход за собой","Ежедневный и регулярный уход"],
  ["Здоровье и отдых","Восстановление, сон, движение и отдых"],
  ["Личное развитие","Обучение, хобби и личные цели"]
];

async function owned(env, table, id, userId) {
  if (!id) return true;
  return Boolean(await env.DB.prepare(`SELECT id FROM ${table} WHERE id=? AND user_id=?`).bind(id,userId).first());
}

export async function onRequestGet({request,env}) {
  const user=await requireUser(request,env);
  if(!user)return json({error:"Необходим вход"},401);
  const count=await env.DB.prepare("SELECT COUNT(*) AS n FROM life_areas WHERE user_id=?").bind(user.id).first();
  if(!Number(count?.n||0)) {
    await env.DB.batch(DEFAULT_AREAS.map(([title,description],i)=>env.DB.prepare(
      "INSERT OR IGNORE INTO life_areas (id,user_id,title,description,sort_order) VALUES (?,?,?,?,?)"
    ).bind(newId(),user.id,title,description,i)));
  }
  const [clients,projects,areas,directions]=await Promise.all([
    env.DB.prepare("SELECT c.*,d.title AS direction_title,(SELECT COUNT(*) FROM projects p WHERE p.client_id=c.id AND p.user_id=c.user_id) AS project_count FROM clients c LEFT JOIN directions d ON d.id=c.direction_id WHERE c.user_id=? ORDER BY c.updated_at DESC").bind(user.id).all(),
    env.DB.prepare("SELECT p.*,c.name AS client_name,d.title AS direction_title,(SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id AND t.user_id=p.user_id AND t.status!='done') AS open_tasks FROM projects p LEFT JOIN clients c ON c.id=p.client_id LEFT JOIN directions d ON d.id=p.direction_id WHERE p.user_id=? ORDER BY CASE p.status WHEN 'active' THEN 0 WHEN 'waiting' THEN 1 WHEN 'draft' THEN 2 ELSE 3 END,p.deadline").bind(user.id).all(),
    env.DB.prepare("SELECT * FROM life_areas WHERE user_id=? AND active=1 ORDER BY sort_order,title").bind(user.id).all(),
    env.DB.prepare("SELECT id,title FROM directions WHERE user_id=? AND active=1 ORDER BY sort_order").bind(user.id).all()
  ]);
  return json({clients:clients.results,projects:projects.results,life_areas:areas.results,directions:directions.results});
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
    const deadline=b.deadline?String(b.deadline):null;
    if(deadline&&!/^\d{4}-\d{2}-\d{2}$/.test(deadline))return json({error:"Проверь дату завершения"},400);
    await env.DB.prepare("INSERT INTO projects (id,user_id,client_id,direction_id,title,description,expected_result,deadline,budget,status) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .bind(id,user.id,clientId,directionId,title,String(b.description||"").slice(0,5000),String(b.expected_result||"").slice(0,2000),deadline,Math.max(0,Number(b.budget)||0),["draft","active","waiting","done","archived"].includes(b.status)?b.status:"active").run();
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
    const r=await env.DB.prepare("UPDATE projects SET title=?,description=?,expected_result=?,deadline=?,budget=?,status=?,updated_at=datetime('now') WHERE id=? AND user_id=?")
      .bind(title,String(b.description||"").slice(0,5000),String(b.expected_result||"").slice(0,2000),b.deadline||null,Math.max(0,Number(b.budget)||0),["draft","active","waiting","done","archived"].includes(b.status)?b.status:"active",id,user.id).run();
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
