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

interface TaskListResponse {
  code: number;
  message: string;
  data: TaskProgressVO[];
}

export async function fetchProcessingTasks(): Promise<TaskProgressVO[]> {
  const response = await request.get<
    TaskProgressVO[] | TaskListResponse,
    TaskProgressVO[] | TaskListResponse
  >("/task/processing");
  if (Array.isArray(response)) return response;
  if (response.code !== 200) throw new Error(response.message || "获取任务失败");
  if (!Array.isArray(response.data)) throw new Error("任务列表格式不正确");
  return response.data;
}

export function fetchTaskStatus(hash: string): Promise<TaskProgressVO> {
  return request.get(`/task/status/${hash}`);
}

export function retryAiAnalyze(hash: string): Promise<void> {
  return request.post("/video/retry-ai-analyze", null, { params: { hash } });
}
