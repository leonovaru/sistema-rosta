export function isClientSelectable(client){return Boolean(client)&&client.status!=="closed";}
export function isProjectSelectable(project){return Boolean(project)&&project.status!=="archived";}
export function isDirectionSelectable(direction){return Boolean(direction)&&Number(direction.active)!==0;}
export function canRestoreProject(project,client){return Boolean(project)&&project.status==="archived"&&(!project.client_id||isClientSelectable(client));}

export function isProjectActiveForWork(project){return Boolean(project)&&["draft","active","waiting"].includes(project.status);}
