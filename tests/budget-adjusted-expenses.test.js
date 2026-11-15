import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBudgetAdjustedExpenseForecast } from '../functions/_lib/budget-adjusted-expenses.js';
test('uses category budgets instead of historical averages and retains unbudgeted categories',()=>{
 const r=buildBudgetAdjustedExpenseForecast([{category:'Продукты',forecast:30000},{category:'Транспорт',forecast:8000},{category:'Коты',forecast:5000}],[{category:'Продукты',planned_amount:25000},{category:'Коты',planned_amount:7000}]);
 assert.equal(r.monthly_total,40000);assert.equal(r.budgeted_categories,2);assert.equal(r.history_categories,1);
 assert.equal(r.categories.find(x=>x.category==='Продукты').forecast,25000);
 assert.equal(r.categories.find(x=>x.category==='Транспорт').forecast,8000);
});
test('a zero category budget is respected rather than replaced by historical spending',()=>{
 const r=buildBudgetAdjustedExpenseForecast([{category:'Развлечения',forecast:4000}],[{category:'Развлечения',planned_amount:0}]);assert.equal(r.monthly_total,0);
});
