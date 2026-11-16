import { json, requireUser, readJson } from "../../_lib/auth.js";
import { calculateBucketBalances } from "../../_lib/income-buckets.js";
import { buildBucketRecommendations } from "../../_lib/bucket-recommendations.js";
function dateInZone(timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return values.year+"-"+values.month+"-"+values.day;
}

export async function onRequestGet({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: "Необходим вход" }, 401);
  const settings = await env.DB.prepare("SELECT timezone FROM settings WHERE user_id=?").bind(user.id).first();
  const today = dateInZone(settings?.timezone || "Europe/Moscow");
  const monthStart = today.slice(0,7)+"-01";
  const [buckets, allocations, expenses, incomeHistory, spendingHistory] = await Promise.all([
    env.DB.prepare("SELECT * FROM income_buckets WHERE user_id=? ORDER BY active DESC,sort_order,title").bind(user.id).all(),
    env.DB.prepare("SELECT bucket_id,SUM(amount) amount FROM income_bucket_allocations WHERE user_id=? GROUP BY bucket_id").bind(user.id).all(),
    env.DB.prepare("SELECT bucket_id,SUM(amount) amount FROM (SELECT bucket_id,amount FROM expenses WHERE user_id=? AND bucket_id IS NOT NULL UNION ALL SELECT bucket_id,amount FROM debt_payments WHERE user_id=? AND bucket_id IS NOT NULL UNION ALL SELECT bucket_id,amount FROM obligation_payments WHERE user_id=? AND bucket_id IS NOT NULL) GROUP BY bucket_id").bind(user.id,user.id,user.id).all(),
    env.DB.prepare("SELECT substr(received_on,1,7) month,SUM(amount) total FROM income_entries WHERE user_id=? AND received_on>=date(?,'-3 months') AND received_on<? GROUP BY substr(received_on,1,7)").bind(user.id,monthStart,monthStart).all(),
    env.DB.prepare("SELECT bucket_id,substr(spent_on,1,7) month,SUM(amount) total FROM (SELECT bucket_id,amount,spent_on FROM expenses WHERE user_id=? UNION ALL SELECT bucket_id,amount,paid_on AS spent_on FROM debt_payments WHERE user_id=? UNION ALL SELECT bucket_id,amount,paid_on AS spent_on FROM obligation_payments WHERE user_id=?) WHERE bucket_id IS NOT NULL AND spent_on>=date(?,'-3 months') AND spent_on<? GROUP BY bucket_id,substr(spent_on,1,7)").bind(user.id,user.id,user.id,monthStart,monthStart).all()
  ]);
  const rows = calculateBucketBalances(buckets.results, allocations.results, expenses.results);
  const activeRows = rows.filter(row => Number(row.active) === 1);
  const percentageTotal = activeRows.reduce((sum, row) => sum + Number(row.percentage), 0);
  const recommendation = buildBucketRecommendations(activeRows,incomeHistory.results,spendingHistory.results,{historyMonths:3});
  return json({ buckets: rows, percentage_total: Math.round(percentageTotal * 100) / 100, allocation_ready: Math.abs(percentageTotal - 100) < 0.0001, recommendation });
}

export async function onRequestPost({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: "Необходим вход" }, 401);
  const body = await readJson(request) || {};
  if(body.action==="archive"){
    const id=String(body.id||"");
    const bucket=await env.DB.prepare("SELECT id,percentage,active FROM income_buckets WHERE id=? AND user_id=?").bind(id,user.id).first();
    if(!bucket)return json({error:"Корзина не найдена"},404);
    if(!bucket.active)return json({ok:true,archived:true});
    const activeCount=await env.DB.prepare("SELECT COUNT(*) AS count FROM income_buckets WHERE user_id=? AND active=1").bind(user.id).first();
    if(Number(activeCount?.count||0)<=1)return json({error:"Нельзя архивировать последнюю активную корзину"},409);
    const percentage=Number(bucket.percentage||0);
    const statements=[];
    if(percentage>0){
      const replacementId=String(body.replacement_bucket_id||"");
      if(!replacementId||replacementId===id)return json({error:"Выбери активную корзину, которой передать процент архивируемой корзины"},400);
      const target=await env.DB.prepare("SELECT id,percentage FROM income_buckets WHERE id=? AND user_id=? AND active=1").bind(replacementId,user.id).first();
      if(!target)return json({error:"Корзина для переноса процента не найдена"},404);
      statements.push(env.DB.prepare("UPDATE income_buckets SET percentage=percentage+?,updated_at=datetime('now') WHERE id=? AND user_id=?").bind(percentage,replacementId,user.id));
    }
    statements.push(env.DB.prepare("UPDATE income_buckets SET active=0,percentage=0,updated_at=datetime('now') WHERE id=? AND user_id=?").bind(id,user.id));
    await env.DB.batch(statements);
    return json({ok:true,archived:true,transferred_percentage:percentage});
  }
  if (body.action !== "update_percentages" || !Array.isArray(body.buckets) || !body.buckets.length) {
    return json({ error: "Передай новое распределение корзин" }, 400);
  }
  const current = await env.DB.prepare("SELECT id FROM income_buckets WHERE user_id=? AND active=1").bind(user.id).all();
  const currentIds = new Set(current.results.map(row => row.id));
  const submitted = new Set();
  let total = 0;
  for (const row of body.buckets) {
    const id = String(row.id || ""), percentage = Number(row.percentage);
    if (!currentIds.has(id) || submitted.has(id) || !Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
      return json({ error: "Проверь корзины и проценты" }, 400);
    }
    submitted.add(id);
    total += percentage;
  }
  if (submitted.size !== currentIds.size || Math.abs(total - 100) > 0.0001) {
    return json({ error: "Распределение должно включать все корзины и составлять ровно 100%" }, 400);
  }
  await env.DB.batch(body.buckets.map(row =>
    env.DB.prepare("UPDATE income_buckets SET percentage=?,updated_at=datetime('now') WHERE id=? AND user_id=?")
      .bind(Number(row.percentage), String(row.id), user.id)
  ));
  return json({ ok: true, percentage_total: total });
}
