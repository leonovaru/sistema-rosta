export function isClientSelectable(client){return Boolean(client)&&client.status!=="closed";}
export function isProjectSelectable(project){return Boolean(project)&&project.status!=="archived";}
export function isDirectionSelectable(direction){return Boolean(direction)&&Number(direction.active)!==0;}
