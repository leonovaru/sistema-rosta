import test from "node:test";
import assert from "node:assert/strict";
import { buildFinancialAttributionSnapshot, resolveHistoricalLabel } from "../functions/_lib/financial-attribution.js";

test("financial entries keep client, project and direction labels from transaction time",()=>{
 const snapshot=buildFinancialAttributionSnapshot({
  direction:{id:"direction-old",title:"Старое направление"},
  client:{id:"client-1",name:"Клиент на дату операции"},
  project:{id:"project-1",title:"Проект на дату операции"}
 });
 assert.deepEqual(snapshot,{
  direction_id_snapshot:"direction-old",
  direction_title_snapshot:"Старое направление",
  client_id_snapshot:"client-1",
  client_name_snapshot:"Клиент на дату операции",
  project_id_snapshot:"project-1",
  project_title_snapshot:"Проект на дату операции"
 });
});

test("unassigned financial entries retain explicit null snapshots",()=>{
 assert.deepEqual(buildFinancialAttributionSnapshot(),{
  direction_id_snapshot:null,direction_title_snapshot:null,
  client_id_snapshot:null,client_name_snapshot:null,
  project_id_snapshot:null,project_title_snapshot:null
 });
});

test("financial history prefers the transaction-time label after an entity is renamed",()=>{
 assert.equal(resolveHistoricalLabel("Проект до переименования","Новое название проекта"),"Проект до переименования");
 assert.equal(resolveHistoricalLabel("","Текущее название"),"Текущее название");
 assert.equal(resolveHistoricalLabel(null,null),"");
});

import { isClientSelectable, isProjectSelectable, isDirectionSelectable } from "../functions/_lib/workspace-entity-availability.js";
test("archived workspace entities remain historical but cannot receive new links",()=>{
 assert.equal(isClientSelectable({id:"c",status:"active"}),true);
 assert.equal(isClientSelectable({id:"c",status:"closed"}),false);
 assert.equal(isProjectSelectable({id:"p",status:"active"}),true);
 assert.equal(isProjectSelectable({id:"p",status:"archived"}),false);
 assert.equal(isDirectionSelectable({id:"d",active:1}),true);
 assert.equal(isDirectionSelectable({id:"d",active:0}),false);
 assert.equal(isDirectionSelectable(null),false);
});
