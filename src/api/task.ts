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

export function retryAiAnalyze(hash: string): Promise<void> {
  return request.post("/video/retry-ai-analyze", null, { params: { hash } });
}
