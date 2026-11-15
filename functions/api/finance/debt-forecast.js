import { json, requireUser } from "../../_lib/auth.js";
import { buildDebtForecast } from "../../_lib/finance.js";
export async function onRequestGet({request,env}) {
 const user=await requireUser(request,env); if(!user)return json({error:"Необходим вход"},401);
 const url=new URL(request.url),extra=Number(url.searchParams.get("extra")||0),horizon=Number(url.searchParams.get("months")||60);
 if(!Number.isFinite(extra)||extra<0||extra>100000000||![12,24,36,60].includes(horizon))return json({error:"Проверь дополнительный платёж и горизонт прогноза"},400);
 const rows=await env.DB.prepare("SELECT id,title,creditor,balance,interest_rate,minimum_payment,status FROM debts WHERE user_id=? AND status='open' ORDER BY balance DESC").bind(user.id).all();
 return json(buildDebtForecast(rows.results,extra,horizon));
}