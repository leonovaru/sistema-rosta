export function buildFinancialAttributionSnapshot({direction=null,client=null,project=null}={}) {
 return {
  direction_id_snapshot:direction?.id||null,
  direction_title_snapshot:direction?.title||null,
  client_id_snapshot:client?.id||null,
  client_name_snapshot:client?.name||null,
  project_id_snapshot:project?.id||null,
  project_title_snapshot:project?.title||null
 };
}

export function resolveHistoricalLabel(snapshot,currentLabel="") {
 return String(snapshot||currentLabel||"");
}
