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
  /**
   * 各清晰度子进度（"1080p" -> 0..100）。仅视频转码时由后端 worker 上报；
   * 不存在 / 还没开始时为 null/undefined。前端用它在卡片上展示「当前哪一档在转」。
   */
  qualityProgress?: Record<string, number> | null;
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
