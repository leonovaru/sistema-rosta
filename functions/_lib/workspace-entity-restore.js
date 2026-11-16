const CLIENT_RESTORABLE = new Set(["lead","active","paused"]);
const PROJECT_RESTORABLE = new Set(["draft","active","waiting","done"]);
export function restoredClientStatus(previousStatus){return CLIENT_RESTORABLE.has(previousStatus)?previousStatus:"active";}
export function restoredProjectStatus(previousStatus){return PROJECT_RESTORABLE.has(previousStatus)?previousStatus:"active";}
