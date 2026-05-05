import request from "../utils/request";

export interface TaskProgressVO {
  hash: string;
  fileName: string;
  type: "video" | "image";
  status: string;
  createdAt: string;
  /**
   * 转码进度百分比（0-100）。
   * 仅 video 在 transcoding 状态下可能有值；其它情况为 null/undefined，
   * UI 自动绕过为不确定动画。
   */
  progress?: number | null;
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
