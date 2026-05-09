import request from '../utils/request'

export interface EmbeddingProgress {
  done: number
  total: number
}

export interface EmbeddingProgressEnvelope {
  images: EmbeddingProgress
  videos: EmbeddingProgress
}

export interface EmbeddingSourceStats {
  fullDone: number
  coverDone: number
  pending: number
  total: number
}

export interface EmbeddingSourceStatsEnvelope {
  images: EmbeddingSourceStats
  videos: EmbeddingSourceStats
}

export interface EmbeddingAdminRow {
  id: number
  hash: string
  embeddingSource: number | null
  embeddingAttempts: number | null
}

export function getEmbeddingProgress() {
  return request.get<EmbeddingProgressEnvelope>('/embedding/progress')
}

export function getEmbeddingSourceStats() {
  return request.get<EmbeddingSourceStatsEnvelope>('/embedding/source-stats')
}

export function listEmbeddingRows(
  mediaType: 'image' | 'video',
  source: 0 | 1 | 2,
  limit = 50
) {
  return request.get<EmbeddingAdminRow[]>('/embedding/list', {
    params: { mediaType, source, limit }
  })
}

/**
 * 重置一条 (mediaType, id) 的 embedding 列，并立即向 sidecar 投递一条嵌入任务。
 *
 * - `affected`: reset 影响的行数（一般 0 或 1）
 * - `enqueued`: 是否成功向 MQ 投递了新的嵌入任务。
 *               affected=1 但 enqueued=false 通常表示缺 url（视频未转码完成等），
 *               已无定时回填，需要稍后重新点击「立即重新嵌入」/「重试」补救。
 */
export function retryEmbedding(mediaType: 'image' | 'video', id: number) {
  return request.post<{ affected: number; enqueued: boolean }>(
    '/embedding/retry',
    { mediaType, id }
  )
}

export function retranscodeVideo(hash: string) {
  return request.post<{
    ok: boolean
    error?: string
    detail?: Record<string, unknown>
  }>('/embedding/retranscode', null, { params: { hash } })
}

/**
 * 热力图：cells 为 (id, v) 列表，按 id 升序。
 *
 * v 是 3 档嵌入完成度（与后端 listEmbeddingHeatmap SQL 对齐）：
 *   0 = 主路径已嵌入（embedding_source = 0 / NULL）
 *   1 = 封面兜底已嵌入（embedding_source = 1）
 *   2 = 待嵌入（embedding IS NULL）
 */
export type HeatmapTier = 0 | 1 | 2

export interface EmbeddingHeatmapResult {
  mediaType: string
  totalEligible: number
  returned: number
  cells: Array<{ id: number; v: HeatmapTier }>
}

export function getEmbeddingHeatmap(mediaType: 'image' | 'video', limit = 25000) {
  return request.get<EmbeddingHeatmapResult>('/embedding/heatmap', {
    params: { mediaType, limit },
    timeout: 120_000
  })
}

/**
 * sidecar 端阶段枚举（与后端 EmbeddingProgressTracker.STAGE_* 对齐）。
 * 改动时三方（sidecar / Java / 前端）必须同步。
 */
export type InFlightStage =
  | 'opening'   // 接到请求，准备 av.open
  | 'sampling'  // 采样视频帧中
  | 'encoding'  // 多帧 / 单图 forward 中（带 frameIndex/frameTotal）
  | 'fusing'    // 多帧 mean-pool + 文本融合（极快）
  | 'done'      // 终态：成功
  | 'failed'    // 终态：失败（detail 带原因）

export interface InFlightTask {
  mediaType: 'image' | 'video'
  mediaId: number
  hash: string | null
  stage: InFlightStage
  /** 仅 encoding 阶段非空 */
  frameIndex: number | null
  frameTotal: number | null
  detail: string | null
  /** 出现在面板上的时间（ms epoch） */
  startedAt: number
  /** 最近一次事件 ms epoch */
  updatedAt: number
  /** updatedAt - startedAt，前端直接用 */
  elapsedMs: number
  done: boolean
  /** done && success → true；failed → false；进行中 → null */
  ok: boolean | null
}

export interface InFlightEnvelope {
  tasks: InFlightTask[]
  total: number
}

/**
 * 拉取「正在处理 + 最近完成」的 embedding 任务列表。
 *
 * 数据源是 metadata-service 内存里的 ConcurrentHashMap，
 * 调用频率高（前端每 2s 一次）也无 IO 压力。
 */
export function getEmbeddingInFlight() {
  return request.get<InFlightEnvelope>('/embedding/in-flight', {
    // 进度面板请求要快、且不能干扰其它请求的 loading 提示
    timeout: 5_000
  })
}
