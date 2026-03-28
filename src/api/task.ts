import request from "../utils/request";

export interface TaskProgressVO {
  hash: string;
  fileName: string;
  type: "video" | "image";
  status: string;
  createdAt: string;
}

export function fetchProcessingTasks(): Promise<TaskProgressVO[]> {
  return request.get("/task/processing");
}

export function fetchTaskStatus(hash: string): Promise<TaskProgressVO> {
  return request.get(`/task/status/${hash}`);
}
