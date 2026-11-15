import { json, requireUser, readJson } from "../../_lib/auth.js";
import { calculateBucketBalances } from "../../_lib/income-buckets.js";

export async function onRequestGet({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: "Необходим вход" }, 401);
  const [buckets, allocations, expenses] = await Promise.all([
    env.DB.prepare("SELECT * FROM income_buckets WHERE user_id=? AND active=1 ORDER BY sort_order,title").bind(user.id).all(),
    env.DB.prepare("SELECT bucket_id,SUM(amount) amount FROM income_bucket_allocations WHERE user_id=? GROUP BY bucket_id").bind(user.id).all(),
    env.DB.prepare("SELECT bucket_id,SUM(amount) amount FROM expenses WHERE user_id=? AND bucket_id IS NOT NULL GROUP BY bucket_id").bind(user.id).all()
  ]);
  const rows = calculateBucketBalances(buckets.results, allocations.results, expenses.results);
  const percentageTotal = rows.reduce((sum, row) => sum + Number(row.percentage), 0);
  return json({ buckets: rows, percentage_total: Math.round(percentageTotal * 100) / 100, allocation_ready: Math.abs(percentageTotal - 100) < 0.0001 });
}

export async function onRequestPost({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: "Необходим вход" }, 401);
  const body = await readJson(request) || {};
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
