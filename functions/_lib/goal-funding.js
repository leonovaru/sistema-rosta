export function validateGoalFundingBucket(value, rows) {
 if(value===null||value===undefined||String(value).trim()==="")return null;
 const id=String(value).trim();
 if(id.length>100)throw new Error("Некорректная корзина-источник");
 const bucket=(Array.isArray(rows)?rows:[]).find(row=>row.id===id);
 if(!bucket||Number(bucket.active)!==1)throw new Error("Выбери существующую активную корзину своего аккаунта");
 return id;
}
