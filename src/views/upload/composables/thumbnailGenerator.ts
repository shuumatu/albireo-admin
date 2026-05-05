/**
 * 在文件加入队列时生成一张小尺寸 dataURL 缩略图，用于：
 *   - 任务列表中的卡片缩略图
 *   - 刷新页面后 File 对象丢失时的兜底显示（dataURL 跟随 pinia 持久化到 localStorage）
 *
 * 设计目标：
 *   - 单张缩略图体积尽量小（默认 144x144 JPEG @ 0.65 quality，~5-15KB）
 *   - 永远不抛错（失败时返回 null，让卡片显示扩展名占位）
 *   - 不阻塞上传主流程（调用方应使用 fire-and-forget）
 */

const DEFAULT_MAX_SIZE = 144
const DEFAULT_QUALITY = 0.65
/** 单张缩略图大小上限，超过的丢弃以保护 localStorage */
const MAX_DATAURL_BYTES = 32 * 1024
/** 同时进行的缩略图生成任务数（视频解码较重，避免一次性把浏览器拖死） */
const MAX_CONCURRENT = 3

let activeJobs = 0
const jobQueue: Array<() => void> = []

function acquireSlot(): Promise<void> {
  if (activeJobs < MAX_CONCURRENT) {
    activeJobs++
    return Promise.resolve()
  }
  return new Promise<void>((resolve) => {
    jobQueue.push(() => {
      activeJobs++
      resolve()
    })
  })
}

function releaseSlot(): void {
  activeJobs--
  const next = jobQueue.shift()
  if (next) next()
}

export async function generateThumbnail(
  file: File,
  fileType: string,
  maxSize: number = DEFAULT_MAX_SIZE,
  quality: number = DEFAULT_QUALITY,
): Promise<string | null> {
  if (!fileType.startsWith('image/') && !fileType.startsWith('video/')) {
    return null
  }
  await acquireSlot()
  try {
    if (fileType.startsWith('image/')) {
      return await generateImageThumb(file, maxSize, quality)
    }
    return await generateVideoThumb(file, maxSize, quality)
  } catch {
    return null
  } finally {
    releaseSlot()
  }
}

async function generateImageThumb(
  file: File,
  maxSize: number,
  quality: number,
): Promise<string | null> {
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    if (!img.naturalWidth || !img.naturalHeight) return null
    return renderToDataURL(img, img.naturalWidth, img.naturalHeight, maxSize, quality)
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function generateVideoThumb(
  file: File,
  maxSize: number,
  quality: number,
): Promise<string | null> {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  // 为某些浏览器静音才能自动播放/seek
  video.muted = true
  video.preload = 'auto'
  video.crossOrigin = 'anonymous'
  // 关键：iOS Safari 需要 playsInline 才能在不全屏的情况下解码帧
  video.setAttribute('playsinline', '')
  video.src = url

  try {
    await waitVideoReady(video)
    if (!video.videoWidth || !video.videoHeight) return null

    // seek 到一个有内容的时间点（文件极短时取中点）
    const target =
      video.duration && Number.isFinite(video.duration)
        ? Math.min(0.5, video.duration * 0.1)
        : 0
    if (target > 0) {
      await seekVideo(video, target)
    }

    return renderToDataURL(
      video,
      video.videoWidth,
      video.videoHeight,
      maxSize,
      quality,
    )
  } finally {
    URL.revokeObjectURL(url)
    // 帮助 GC 立即释放
    video.removeAttribute('src')
    try { video.load() } catch { /* ignore */ }
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image load error'))
    img.src = url
  })
}

function waitVideoReady(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error('video load timeout'))
    }, 8000)
    const onMeta = () => {
      cleanup()
      resolve()
    }
    const onErr = () => {
      cleanup()
      reject(new Error('video load error'))
    }
    function cleanup() {
      window.clearTimeout(timer)
      video.removeEventListener('loadeddata', onMeta)
      video.removeEventListener('error', onErr)
    }
    video.addEventListener('loadeddata', onMeta)
    video.addEventListener('error', onErr)
  })
}

function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup()
      // 超时不算致命错误：直接尝试用当前帧
      resolve()
    }, 4000)
    const onSeeked = () => {
      cleanup()
      resolve()
    }
    const onErr = () => {
      cleanup()
      reject(new Error('video seek error'))
    }
    function cleanup() {
      window.clearTimeout(timer)
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onErr)
    }
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('error', onErr)
    try {
      video.currentTime = time
    } catch (e) {
      cleanup()
      reject(e instanceof Error ? e : new Error('seek failed'))
    }
  })
}

function renderToDataURL(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  maxSize: number,
  quality: number,
): string | null {
  // 等比缩放，长边对齐 maxSize
  const scale = Math.min(1, maxSize / Math.max(srcW, srcH))
  const w = Math.max(1, Math.round(srcW * scale))
  const h = Math.max(1, Math.round(srcH * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  try {
    ctx.drawImage(source, 0, 0, w, h)
  } catch {
    // 跨域/解码失败
    return null
  }

  let dataUrl: string
  try {
    dataUrl = canvas.toDataURL('image/jpeg', quality)
  } catch {
    return null
  }

  // 兜底大小校验：避免极端情况下灌爆 localStorage
  if (estimateBase64Bytes(dataUrl) > MAX_DATAURL_BYTES) {
    // 再压一档
    try {
      const smaller = canvas.toDataURL('image/jpeg', Math.max(0.4, quality - 0.2))
      if (estimateBase64Bytes(smaller) <= MAX_DATAURL_BYTES) return smaller
    } catch {
      /* ignore */
    }
    return null
  }
  return dataUrl
}

function estimateBase64Bytes(dataUrl: string): number {
  // data:image/jpeg;base64,XXXX → 取逗号后部分按 base64 估算
  const idx = dataUrl.indexOf(',')
  if (idx < 0) return dataUrl.length
  const payload = dataUrl.length - idx - 1
  return Math.floor((payload * 3) / 4)
}
