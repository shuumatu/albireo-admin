import request from '../utils/request'

/**
 * 期望的标准转码档位（与后端 ProcessVideoProducer.sendDefaultTranscodeTask 一致）。
 * 列表行的 done / missing 都按这个顺序展示，UI 渲染稳定。
 */
export const EXPECTED_QUALITIES = ['1080p', '720p', '480p'] as const
export type ExpectedQuality = (typeof EXPECTED_QUALITIES)[number]

/** 视频侧待重处理行：同时承载 transcode_failed 视频缺哪几档转码 + 是否缺封面。 */
export interface ReprocessVideoRow {
  hash: string
  uuid: string | null
  fileName: string | null
  status: string
  createdAt: string
  doneQualities: string[]
  missingQualities: string[]
  /** 是否已存在 video_images.usage='cover'；为 false 则推断为「缩略图缺失」。 */
  coverPresent: boolean
}

/** 图片侧待重处理行：仅 process_failed 状态的图片。 */
export interface ReprocessImageRow {
  hash: string
  uuid: string | null
  fileName: string | null
  status: string
  createdAt: string
}

export interface ReprocessListResponse {
  videoTotal: number
  imageTotal: number
  video: ReprocessVideoRow[]
  image: ReprocessImageRow[]
}

/** type='video' / 'image' / 'all'（默认）。'all' 时两侧并发分页（共享 page/pageSize）。 */
export function fetchReprocessList(params: {
  page?: number
  pageSize?: number
  type?: 'all' | 'video' | 'image'
}) {
  return request.get<ReprocessListResponse>('/reprocess/list', { params })
}

/** 重投响应。requeued 是视频侧本次重投的缺失档列表；图片场景为空。 */
export interface RetryResult {
  ok: boolean
  error?: string
  requeued?: string[]
  needCover?: boolean
  /** 兜底特殊路径（如「无遗漏，直接 ai_analyzing」）的说明，正常重投为 null。 */
  message?: string | null
}

/** 统一重投入口：mediaType='video' 走转码缺失档 + 封面，'image' 走 image.process。 */
export function retryReprocess(mediaType: 'video' | 'image', hash: string) {
  return request.post<RetryResult>('/reprocess/retry', { mediaType, hash })
}
