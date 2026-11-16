import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {join,dirname} from "node:path";
import {fileURLToPath} from "node:url";
const root=join(dirname(fileURLToPath(import.meta.url)),"..");
const finance=readFileSync(join(root,"functions/api/finance.js"),"utf8");
const irregular=readFileSync(join(root,"functions/api/finance/irregular-expenses.js"),"utf8");
const forecast=readFileSync(join(root,"functions/api/finance/forecast.js"),"utf8");
test("debt payment retries require the same amount, date and note",()=>{
 assert.ok(finance.includes("SELECT id,debt_id,amount,paid_on,note FROM debt_payments WHERE user_id=? AND request_id=?"));
 assert.ok(finance.includes("prior.paid_on!==date||String(prior.note||\"\")!==String(body.note||\"\").slice(0,500)"));
 assert.ok(finance.includes("existing.paid_on!==date||String(existing.note||\"\")!==String(body.note||\"\").slice(0,500)"));
});
test("obligation payment retries require the same payment date and scheduled occurrence",()=>{
 assert.ok(finance.includes("SELECT id,obligation_id,scheduled_due_date,paid_on FROM obligation_payments WHERE user_id=? AND request_id=?"));
 assert.ok(finance.includes("prior.paid_on!==date||(requestedPeriod&&prior.scheduled_due_date!==requestedPeriod)"));
 assert.ok(finance.includes("existing.scheduled_due_date!==scheduledDate||existing.paid_on!==date"));
});
test("irregular payment retries require the same payment date and occurrence",()=>{
 assert.ok(irregular.includes("SELECT id,irregular_expense_id,amount,paid_on,scheduled_due_date FROM irregular_expense_payments WHERE user_id=? AND request_id=?"));
 assert.ok(irregular.includes("prior.paid_on!==paidOn||prior.scheduled_due_date!==dueDate"));
 assert.ok(irregular.includes("existing.paid_on===paidOn&&existing.scheduled_due_date===dueDate"));
});
test("irregular payment preflight balance subtracts active funding transfers net of reversals",()=>{
 assert.ok(irregular.includes("const [allocated,spent,debt,obligations,transfers]=await Promise.all(["));
 assert.ok(irregular.includes("Number(obligations.total||0)-Number(transfers.total||0)"));
});

test("database guards for already transferred bucket funds return conflict responses instead of server errors",()=>{
 assert.ok(finance.includes('message.includes("Средства уже переведены из корзины")) return "bucket"'));
 assert.ok(finance.includes('message.includes("Средства уже переведены из корзины"))return json({error:"В корзине недостаточно свободных денег для новой суммы. Расход не изменён."},409)'));
 assert.ok(irregular.includes('message.includes("Средства уже переведены из корзины"))return json({error:"В выбранной корзине недостаточно свободных денег для оплаты."},409)'));
});

test("forecast API loads reopened unpaid occurrences even when the recurring cursor has advanced",()=>{
 assert.ok(forecast.includes("AS unpaid_occurrences"));
 assert.ok(forecast.includes("o.status='unpaid' AND o.scheduled_due_date<p.due_date"));
 assert.ok(forecast.includes("u.status='unpaid' AND u.scheduled_due_date<p.due_date AND u.scheduled_due_date<=?"));
});

test("forecast API loads reopened irregular payment occurrences after the recurrence cursor advances",()=>{
 assert.ok(forecast.includes("AS unpaid_occurrences FROM irregular_expenses e"));
 assert.ok(forecast.includes("o.status='unpaid' AND o.scheduled_due_date<e.next_date"));
 assert.ok(forecast.includes("u.status='unpaid' AND u.scheduled_due_date<e.next_date AND u.scheduled_due_date<=?"));
});

test("irregular payment retries compare only request fields, not mutable current schedule amount",()=>{
 assert.ok(irregular.includes("SELECT id,irregular_expense_id,paid_on,scheduled_due_date FROM irregular_expense_payments WHERE user_id=? AND request_id=?"));
 assert.ok(irregular.includes("prior.irregular_expense_id!==expenseId||prior.paid_on!==paidOn||prior.scheduled_due_date!==dueDate"));
 assert.ok(!irregular.includes("Number(prior.amount)-Number(item.amount)"));
 assert.ok(!irregular.includes("Number(existing.amount)-amount"));
});
