export function isTaskAvailableForPlanning(task){
 if(!task)return false;
 if(["done","archived"].includes(task.project_status)||task.client_status==="closed"||task.project_client_status==="closed")return false;
 return true;
}
