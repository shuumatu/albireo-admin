/**
 * 图片展示用的纯函数集，列表 / 卡片 / 抽屉等多处共用。
 *
 * 与视频侧的 videoFormat 区别：
 *  - 图片有自己的业务类型 photo / cover / other 标签；
 *  - 缩略图 / 中等尺寸 url 是从 R2 上 raw 路径派生的固定路径，需要这套替换函数；
 *  - 时间格式 / 文件后缀 / 失败状态判定逻辑直接复用 videoFormat，避免重复。
 */

export type NaiveTagType = 'default' | 'primary' | 'info' | 'success' | 'warning' | 'error'

export {
  formatRelative,
  fileExtensionUpper,
} from '../../video/composables/videoFormat'

/**
 * 把 raw 原图路径替换为 medium 缩略图。
 * R2 约定：`https://cdn/.../images/{hash}/raw/{file}` → `.../images/{hash}/medium/medium.jpg`。
 * 与原 ImageManager.vue#L744 行为保持一致；非 raw 路径或非 R2 url 直接返回原值。
 */
export function toMediumUrl(url: string | null | undefined): string {
  if (!url) return ''
  return url.replace(/\/raw\/[^/]+$/, '/medium/medium.jpg')
}

/**
 * 缩略图（更小尺寸）。当前 R2 约定有 thumb/thumb.jpg 但部分 worker 还在生成中——
 * 失败时会回退到 medium，不会让 <img> 出现裂图。
 */
export function toThumbUrl(url: string | null | undefined): string {
  if (!url) return ''
  return url.replace(/\/raw\/[^/]+$/, '/thumb/thumb.jpg')
}

/** 业务类型中文标签 */
export function imageTypeLabel(t: string | null | undefined): string {
  if (t === 'photo') return '照片'
  if (t === 'cover') return '封面'
  if (t === 'other') return '其他'
  return ''
}

/** 类型对应的 tag 高亮风格 */
export function imageTypeTagType(t: string | null | undefined): NaiveTagType {
  if (t === 'photo') return 'success'
  if (t === 'cover') return 'info'
  if (t === 'other') return 'default'
  return 'default'
}

/** 状态中文标签 */
export function imageStatusLabel(s: string | null | undefined): string {
  const map: Record<string, string> = {
    uploading: '上传中',
    pending: '待处理',
    processing: '处理中',
    done: '已完成',
    failed: '上传失败',
    process_failed: '处理失败',
  }
  if (!s) return ''
  return map[s] ?? s
}

/**
 * 处理失败的图片在卡片上需要红环 + 顶部 alert 提示。
 * pending / processing 是正常进度状态，不算异常；failed / process_failed 都视为终态失败。
 */
export function imageNeedsAttention(status: string | null | undefined): boolean {
  return status === 'failed' || status === 'process_failed'
}

/**
 * 处理中状态判定，用于卡片是否覆盖 status overlay。
 */
export function imageIsProcessing(status: string | null | undefined): boolean {
  return status === 'uploading' || status === 'processing' || status === 'pending'
}
