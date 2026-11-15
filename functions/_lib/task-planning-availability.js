export function isTaskAvailableForPlanning(task){
 if(!task)return false;
 if(task.project_status==="archived"||task.client_status==="closed"||task.project_client_status==="closed")return false;
 return true;
}
