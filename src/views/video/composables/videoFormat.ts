/**
 * 视频展示用的纯函数集，列表 / 卡片 / 抽屉等多处共用。
 * 全部纯函数：不读取响应式状态、不引入框架依赖，便于单测与复用。
 */

/**
 * 把毫秒时长格式化为 mm:ss 或 h:mm:ss。
 * 后端老数据可能是 null，统一返回空字符串让 UI 选择不渲染。
 */
export function formatDuration(durationMs: number | null | undefined): string {
  if (durationMs == null || !Number.isFinite(durationMs) || durationMs <= 0) return ''
  const sec = Math.round(durationMs / 1000)
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) {
    return `${h}:${pad2(m)}:${pad2(s)}`
  }
  return `${pad2(m)}:${pad2(s)}`
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/**
 * 由宽高推导出"分辨率名称"——管理员通常更想看"1080P / 720P"而非具体像素。
 * 用 Math.min 处理竖屏视频（720x1280 也是 720P）。
 */
export function resolutionLabel(width: number | null | undefined, height: number | null | undefined): string {
  if (!width || !height) return ''
  const shortEdge = Math.min(width, height)
  if (shortEdge >= 2160) return '4K'
  if (shortEdge >= 1440) return '2K'
  if (shortEdge >= 1080) return '1080P'
  if (shortEdge >= 720) return '720P'
  if (shortEdge >= 480) return '480P'
  if (shortEdge >= 360) return '360P'
  return `${shortEdge}P`
}

/**
 * 字节数 → 友好字符串。视频文件普遍 100MB-2GB，给到 GB 一位小数。
 */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return ''
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  const gb = mb / 1024
  return `${gb.toFixed(2)} GB`
}

/**
 * "刚刚 / N 分钟前 / 昨天 / N 天前 / 日期" —— 卡片底部用相对时间扫一眼即可，
 * 完整时间走 hover tooltip。
 */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const diff = Date.now() - d.getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return '刚刚'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} 分钟前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} 小时前`
  const day = Math.floor(hour / 24)
  if (day === 1) return '昨天'
  if (day < 7) return `${day} 天前`
  return d.toLocaleDateString('zh-CN')
}

/**
 * 文件名后缀（大写），无后缀时返回 'VIDEO'。封面缺失占位时用作小标识。
 */
export function fileExtensionUpper(fileName: string | null | undefined): string {
  if (!fileName) return 'VIDEO'
  const idx = fileName.lastIndexOf('.')
  if (idx < 0 || idx === fileName.length - 1) return 'VIDEO'
  return fileName.slice(idx + 1).toUpperCase()
}

export function visibilityText(v: string | null | undefined): string {
  if (v === 'private') return '私密'
  if (v === 'friends') return '好友'
  if (v === 'public') return '公开'
  return ''
}

export type NaiveTagType = 'default' | 'primary' | 'info' | 'success' | 'warning' | 'error'

export function visibilityTagType(v: string | null | undefined): NaiveTagType {
  if (v === 'public') return 'success'
  if (v === 'friends') return 'info'
  if (v === 'private') return 'warning'
  return 'default'
}

/**
 * 从某些状态推导出"需要用户处理"——卡片要红框 + 顶部 alert 都用这个。
 */
export function needsAttention(status: string | null | undefined): boolean {
  return status === 'failed' || status === 'ai_analyze_failed'
}

/**
 * 从某些状态推导出"正在处理中"，UI 用这个决定要不要画进度条 / 转圈。
 */
export function isProcessing(status: string | null | undefined): boolean {
  return (
    status === 'uploading' ||
    status === 'processing' ||
    status === 'transcoding' ||
    status === 'ai_analyzing'
  )
}

/**
 * 公共站详情页 URL。
 * 优先 import.meta.env.VITE_PUBLIC_SITE_URL；
 * 否则按当前 origin，admin (5173) 自动映射到公共站 (5174)。
 */
export function getPublicSiteOrigin(): string {
  const envUrl = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.trim()
  if (envUrl) return envUrl.replace(/\/+$/, '')
  if (typeof window !== 'undefined' && window.location) {
    const { protocol, hostname, port } = window.location
    const targetPort = port === '5173' ? '5174' : port || '5174'
    return `${protocol}//${hostname}:${targetPort}`
  }
  return 'http://localhost:5174'
}

/**
 * R2 上视频的不同画质流。`original` 是上传原画，`1080p / 720p / 480p` 是 worker 转码产物。
 * 只有 `done` 状态视频四个都有；其它状态可能只有 `original`。
 */
export type VideoQuality = 'original' | '1080p' | '720p' | '480p'

/**
 * 根据 objectKey + 画质拼 R2 CDN 上的 mp4 流地址。
 *
 * cdnOrigin 必须是 R2 CDN 域名（如 `https://albireo.shuumatu.com`），
 * **不是**公共站前端地址 (`VITE_PUBLIC_SITE_URL`)。两者写错了文件根本不在那儿。
 *
 * 转码产物路径与公共站 VideoDetail.vue 保持一致：去掉 `/original/<file>` 后挂 `/{quality}/{quality}.mp4`。
 */
export function getStreamUrl(
  objectKey: string | null | undefined,
  cdnOrigin: string,
  quality: VideoQuality
): string {
  if (!objectKey || !cdnOrigin) return ''
  const origin = cdnOrigin.replace(/\/+$/, '')
  const normalized = objectKey.startsWith('/') ? objectKey.slice(1) : objectKey
  const original = `${origin}/${normalized}`
  if (quality === 'original') return original
  const basePath = original.replace(/\/original\/[^/]*$/, '')
  return `${basePath}/${quality}/${quality}.mp4`
}

/** Hover 预览专用：固定 480p，带宽友好且全屏弹小预览刚好够用。 */
export function get480pStreamUrl(objectKey: string | null | undefined, cdnOrigin: string): string {
  return getStreamUrl(objectKey, cdnOrigin, '480p')
}

/**
 * 封面帧选择器的级联候选：720p（画质 + 速度平衡）→ 480p（兜底）→ 原画（最后兜底，画质最好但慢）。
 * 转码尚未完成的视频可能只有原画，链表能优雅降级。
 */
export function getCoverPickerCandidates(
  objectKey: string | null | undefined,
  cdnOrigin: string
): string[] {
  if (!objectKey || !cdnOrigin) return []
  return [
    getStreamUrl(objectKey, cdnOrigin, '720p'),
    getStreamUrl(objectKey, cdnOrigin, '480p'),
    getStreamUrl(objectKey, cdnOrigin, 'original'),
  ].filter(Boolean)
}
