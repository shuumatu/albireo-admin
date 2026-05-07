import { onMounted, onBeforeUnmount, watch } from 'vue'
import exifr from 'exifr'
import {
  initiateUpload,
  getParts,
  getUploadUrl,
  completeUpload,
  completeDirectUpload,
  getSessionByHash,
  cancelUpload,
  type PartETagDTO,
  type GpsData,
} from '../../../api/upload'
import { useUploadStore, type UploadTask } from '../../../stores/uploadStore'
import { generateThumbnail } from './thumbnailGenerator'

interface Runtime {
  file: File
  fileType: string
  abortController?: AbortController
  paused: boolean
  /** 已被用户取消：runTask 在所有 await 边界检查后必须 early-return，避免误发 complete。 */
  cancelled: boolean
  /** 滑动窗口速度采样（最多保留 5 秒） */
  speedSamples: { ts: number; bytes: number }[]
  /** 已上传字节计数（运行时） */
  uploadedBytes: number
  /** 总字节数 */
  totalBytes: number
  /** 服务器侧已知的 part 列表（断点续传） */
  uploadedParts: PartETagDTO[]
  /** 全部分片切分 */
  parts: { partNumber: number; start: number; end: number }[]
  /** 各分片当前已发送字节（XHR upload 聚合用，整块完成后会清零该 key） */
  partUploadLoaded: Map<number, number>
  /** 上传上下文 */
  key?: string
  uploadId?: string
  partSize?: number
  fileHash?: string
}

/** 模块级运行时 Map，保证 composable 多次调用共享实例 */
const runtimeMap = new Map<string, Runtime>()

/** 简单可变大小的 Semaphore（用于全局分片并发控制） */
class Semaphore {
  private permits: number
  private size: number
  private waiters: Array<() => void> = []

  constructor(size: number) {
    this.size = size
    this.permits = size
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--
      return
    }
    return new Promise<void>((resolve) => this.waiters.push(resolve))
  }

  release(): void {
    if (this.waiters.length > 0) {
      const w = this.waiters.shift()!
      w()
    } else {
      this.permits++
    }
  }

  setSize(n: number): void {
    const delta = n - this.size
    this.size = n
    if (delta > 0) {
      this.permits += delta
      while (this.permits > 0 && this.waiters.length > 0) {
        this.permits--
        this.waiters.shift()!()
      }
    } else {
      this.permits = Math.max(0, this.permits + delta)
    }
  }
}

const globalSemaphore = new Semaphore(4)

const FAILED_PART_RETRY = 3
const TASK_MAX_RETRY = 5

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9)
}

function dateToISOWithTZ(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0')
  const tzOffset = -date.getTimezoneOffset()
  const sign = tzOffset >= 0 ? '+' : '-'
  const tzH = pad(Math.floor(Math.abs(tzOffset) / 60))
  const tzM = pad(Math.abs(tzOffset) % 60)
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${tzH}:${tzM}`
  )
}

function convertExifDateToISO(exifDate: string): string | null {
  if (!exifDate) return null
  try {
    const normalized = exifDate
      .replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3')
      .replace(' ', 'T')
    const d = new Date(normalized)
    if (isNaN(d.getTime())) return null
    return dateToISOWithTZ(d)
  } catch {
    return null
  }
}

function getFileMimeType(file: File): string {
  if (file.type) return file.type
  const ext = file.name.split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
    webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', ico: 'image/x-icon',
    heic: 'image/heic', heif: 'image/heif',
    mp4: 'video/mp4', avi: 'video/x-msvideo', mov: 'video/quicktime',
    wmv: 'video/x-ms-wmv', flv: 'video/x-flv', mkv: 'video/x-matroska', webm: 'video/webm',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac', aac: 'audio/aac',
    pdf: 'application/pdf', txt: 'text/plain',
    zip: 'application/zip', rar: 'application/x-rar-compressed', '7z': 'application/x-7z-compressed',
  }
  return map[ext || ''] || 'application/octet-stream'
}

function computeHashWithProgress(
  file: File,
  onProgress: (p: number) => void,
  chunkSize: number = 4 * 1024 * 1024,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('../../../workers/fileHashWorker.ts', import.meta.url),
      { type: 'module' },
    )
    worker.onmessage = (e) => {
      const { status, hash, progress, error } = e.data
      if (status === 'progress') {
        onProgress(progress)
      } else if (status === 'done') {
        resolve(hash)
        worker.terminate()
      } else if (status === 'error') {
        reject(new Error(error))
        worker.terminate()
      }
    }
    worker.onerror = (err) => {
      reject(err)
      worker.terminate()
    }
    worker.postMessage({ file, chunkSize })
  })
}

function createParts(file: File, partSize: number) {
  const parts = []
  let n = 1
  for (let off = 0; off < file.size; off += partSize, n++) {
    parts.push({ partNumber: n, start: off, end: Math.min(off + partSize, file.size) })
  }
  return parts
}

async function extractMetadata(file: File): Promise<{
  gpsData: GpsData | null
  dateTime: string
  dateTimeSource: 'exif' | 'file'
}> {
  let gpsData: GpsData | null = null
  let dateTime: string | null = null
  let dateTimeSource: 'exif' | 'file' = 'file'
  try {
    const meta: any = await exifr.parse(file, {
      gps: true,
      pick: [
        'latitude', 'longitude', 'GPSLatitude', 'GPSLongitude',
        'altitude', 'GPSAltitude', 'GPSAltitudeRef',
        'DateTimeOriginal', 'CreateDate', 'CreationDate',
        'MediaCreateDate', 'TrackCreateDate', 'DateTime',
      ],
    })
    if (meta) {
      const lat = meta.latitude ?? meta.GPSLatitude
      const lon = meta.longitude ?? meta.GPSLongitude
      let alt = meta.altitude ?? meta.GPSAltitude
      if (alt != null && meta.GPSAltitudeRef === 1) alt = -Math.abs(alt)
      else if (alt != null) alt = Math.abs(alt)
      if (lat != null && lon != null) {
        gpsData = { latitude: lat, longitude: lon, altitude: alt != null ? alt : null }
      }
      const raw =
        meta.DateTimeOriginal ?? meta.CreateDate ?? meta.CreationDate ??
        meta.MediaCreateDate ?? meta.TrackCreateDate ?? meta.DateTime
      if (raw) {
        if (raw instanceof Date) {
          dateTime = dateToISOWithTZ(raw)
          dateTimeSource = 'exif'
        } else if (typeof raw === 'string') {
          const conv = convertExifDateToISO(raw)
          if (conv) {
            dateTime = conv
            dateTimeSource = 'exif'
          }
        }
      }
    }
  } catch {
    /* ignore */
  }
  if (!dateTime) {
    dateTime = dateToISOWithTZ(new Date(file.lastModified))
    dateTimeSource = 'file'
  }
  return { gpsData, dateTime, dateTimeSource }
}

function classifyError(err: unknown): 'retry' | 'fatal' | 'aborted' {
  if (!err) return 'retry'
  const e = err as any
  if (e.name === 'AbortError') return 'aborted'
  // axios error
  const status = e?.response?.status
  if (typeof status === 'number') {
    if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
      return 'fatal'
    }
  }
  return 'retry'
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * 预签名 PUT：用 XHR 以拿到 upload progress（fetch 无法实现字节级上传进度）。
 */
function putBlobWithProgress(
  url: string,
  body: Blob,
  opts: {
    contentType?: string
    signal?: AbortSignal
    onUploadProgress?: (loaded: number, total: number) => void
  } = {},
): Promise<{ ok: boolean; status: number; etag: string }> {
  const nominalTotal = typeof body.size === 'number' && body.size > 0 ? body.size : 0
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) {
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
      return
    }
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    if (opts.contentType) xhr.setRequestHeader('Content-Type', opts.contentType)
    xhr.upload.onprogress = (ev) => {
      if (!opts.onUploadProgress) return
      const total =
        ev.lengthComputable && ev.total > 0 ? ev.total : nominalTotal || ev.total || 1
      opts.onUploadProgress(ev.loaded, Math.max(ev.loaded, total))
    }
    xhr.onload = () => {
      const raw =
        xhr.getResponseHeader('etag') ?? xhr.getResponseHeader('ETag') ?? ''
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        etag: raw.replaceAll('"', ''),
      })
    }
    xhr.onerror = () => reject(new Error('上传网络错误'))
    xhr.onabort = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    const onAbort = () => xhr.abort()
    opts.signal?.addEventListener('abort', onAbort)
    xhr.addEventListener('loadend', () => opts.signal?.removeEventListener('abort', onAbort), {
      once: true,
    })
    xhr.send(body)
  })
}

export function useUploadQueue() {
  const store = useUploadStore()

  // 启动时把上次刷新仍在「运行中」的任务标记为需要恢复
  onMounted(() => {
    store.markRunningAsStale()
  })

  // 跟随 store.concurrency 调整全局并发
  watch(
    () => store.concurrency,
    (n) => globalSemaphore.setSize(Math.max(1, Math.min(16, n))),
    { immediate: true },
  )

  // beforeunload 拦截
  function onBeforeUnload(e: BeforeUnloadEvent) {
    if (store.hasRunningTasks()) {
      e.preventDefault()
      e.returnValue = ''
      return ''
    }
  }
  onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
  onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))

  /**
   * 后台异步生成缩略图并写回 store；不阻塞主流程，失败时静默忽略。
   * 仅当任务还没有 thumbnailDataUrl，且文件类型是图片/视频时才会执行。
   */
  function ensureThumbnail(taskId: string, file: File, fileType: string): void {
    const t = store.tasks.find((x) => x.id === taskId)
    if (!t || t.thumbnailDataUrl) return
    if (!fileType.startsWith('image/') && !fileType.startsWith('video/')) return
    void generateThumbnail(file, fileType)
      .then((dataUrl) => {
        if (!dataUrl) return
        const stillExists = store.tasks.find((x) => x.id === taskId)
        if (!stillExists) return
        store.updateTask(taskId, { thumbnailDataUrl: dataUrl })
      })
      .catch(() => {
        /* 静默忽略：缩略图失败不影响上传 */
      })
  }

  /**
   * 加入一组文件（去重 + 自动开跑）
   * @returns 入队统计，便于上层显示提示
   */
  function enqueueFiles(files: File[]): {
    addedIds: string[]
    skippedDuplicate: { fileName: string; reason: 'queued' | 'completed' | 'paused' | 'uploading' }[]
  } {
    const addedIds: string[] = []
    const skippedDuplicate: { fileName: string; reason: 'queued' | 'completed' | 'paused' | 'uploading' }[] = []

    for (const file of files) {
      // 去重 1：本地 name+size+lastModified 弱拦截，hash 阶段再做权威判断。
      // 加上 lastModified 是为了避免「同名同大小但内容已改」的第二份文件被静默跳过。
      const dup = store.findByNameSize(file.name, file.size, file.lastModified)
      if (dup && dup.status !== 'error' && !dup.isStale) {
        let reason: 'queued' | 'completed' | 'paused' | 'uploading' = 'queued'
        if (dup.status === 'success') reason = 'completed'
        else if (dup.status === 'paused' || dup.status === 'pausing') reason = 'paused'
        else if (
          dup.status === 'uploading' ||
          dup.status === 'hashing' ||
          dup.status === 'preparing'
        )
          reason = 'uploading'
        skippedDuplicate.push({ fileName: file.name, reason })
        continue
      }

      const id = uid()
      const fileType = getFileMimeType(file)
      const task: UploadTask = {
        id,
        fileName: file.name,
        fileSize: file.size,
        lastModified: file.lastModified,
        fileType,
        status: 'queued',
        progress: 0,
        hashProgress: 0,
        uploadedBytes: 0,
        speed: 0,
        eta: null,
        createdAt: Date.now(),
        retryCount: 0,
      }
      runtimeMap.set(id, {
        file,
        fileType,
        paused: false,
        cancelled: false,
        speedSamples: [],
        uploadedBytes: 0,
        totalBytes: file.size,
        uploadedParts: [],
        parts: [],
        partUploadLoaded: new Map(),
      })
      store.addTask(task)
      addedIds.push(id)
      // 后台生成持久化缩略图（用于刷新后兜底显示）
      ensureThumbnail(id, file, fileType)
      // 不 await，串行启动会拖慢 UI
      void runTask(id)
    }

    return { addedIds, skippedDuplicate }
  }

  function attachFile(taskId: string, file: File) {
    const task = store.tasks.find((t) => t.id === taskId)
    if (!task) return
    if (file.name !== task.fileName || file.size !== task.fileSize) {
      store.updateTask(taskId, {
        status: 'error',
        errorMessage: '所选文件与原任务不匹配，请选择同名同大小的文件',
      })
      return
    }
    const fileType = task.fileType || getFileMimeType(file)
    runtimeMap.set(taskId, {
      file,
      fileType,
      paused: false,
      cancelled: false,
      speedSamples: [],
      uploadedBytes: 0,
      totalBytes: file.size,
      uploadedParts: [],
      parts: [],
      partUploadLoaded: new Map(),
    })
    store.updateTask(taskId, {
      status: 'queued',
      isStale: false,
      errorMessage: undefined,
      retryCount: 0,
    })
    ensureThumbnail(taskId, file, fileType)
    void runTask(taskId)
  }

  function pauseTask(id: string) {
    const task = store.tasks.find((t) => t.id === id)
    const rt = runtimeMap.get(id)
    if (!task || !rt) return
    if (
      task.status !== 'uploading' &&
      task.status !== 'hashing' &&
      task.status !== 'preparing'
    ) {
      return
    }
    rt.paused = true
    rt.abortController?.abort()
    store.updateTask(id, { status: 'pausing' })
    setTimeout(() => {
      const t2 = store.tasks.find((x) => x.id === id)
      if (t2 && t2.status === 'pausing') {
        store.updateTask(id, { status: 'paused', speed: 0, eta: null })
      }
    }, 120)
  }

  function resumeTask(id: string) {
    const task = store.tasks.find((t) => t.id === id)
    const rt = runtimeMap.get(id)
    if (!task || !rt) return
    if (task.status !== 'paused' && task.status !== 'error') return
    rt.paused = false
    store.updateTask(id, { status: 'queued', errorMessage: undefined })
    void runTask(id)
  }

  function retryTask(id: string) {
    const task = store.tasks.find((t) => t.id === id)
    if (!task) return
    if (task.isStale) return
    const rt = runtimeMap.get(id)
    if (!rt) return
    rt.paused = false
    rt.speedSamples = []
    store.updateTask(id, {
      status: 'queued',
      errorMessage: undefined,
      retryCount: 0,
      progress: 0,
      hashProgress: 0,
      uploadedBytes: 0,
      speed: 0,
      eta: null,
    })
    rt.uploadedBytes = 0
    rt.uploadedParts = []
    rt.parts = []
    rt.partUploadLoaded = new Map()
    rt.key = undefined
    rt.uploadId = undefined
    void runTask(id)
  }

  /**
   * 移除任务：终态（success / error / need-resume / paused）直接移除；
   * 仍在运行中（queued / hashing / preparing / uploading / pausing）则视为「取消」，
   * 同步置 cancelled 标志、abort 飞行中的 XHR，并通知后端清理 MPU / 孤儿对象 / metadata 占位。
   */
  function removeTask(id: string) {
    const task = store.tasks.find((t) => t.id === id)
    const rt = runtimeMap.get(id)

    // 取一份后端清理所需的快照，避免 store / runtime 移除后丢失
    const fileHash = rt?.fileHash ?? task?.fileHash
    const objectKey = rt?.key ?? task?.objectKey
    const uploadId = rt?.uploadId ?? task?.uploadId
    const wasActive =
      !!task &&
      task.status !== 'success' &&
      task.status !== 'error' &&
      task.status !== 'need-resume'

    if (rt) {
      rt.cancelled = true
      rt.paused = true
      try {
        rt.abortController?.abort()
      } catch {
        /* ignore */
      }
    }

    runtimeMap.delete(id)
    store.removeTask(id)

    // 完成态不需要后端清理；秒传 / 直传成功后已写 digest，后端 cancel 也会跳过
    const shouldNotifyBackend =
      wasActive && !!(fileHash || (objectKey && uploadId))
    if (shouldNotifyBackend) {
      void cancelUpload({ fileHash, objectKey, uploadId }).catch(() => {
        /* fire-and-forget：失败由后端定时清理兜底 */
      })
    }
  }

  function pauseAll() {
    for (const t of store.tasks) {
      if (
        t.status === 'uploading' ||
        t.status === 'hashing' ||
        t.status === 'preparing' ||
        t.status === 'queued'
      ) {
        pauseTask(t.id)
      }
    }
  }

  function resumeAll() {
    for (const t of store.tasks) {
      if (t.status === 'paused') resumeTask(t.id)
    }
  }

  function retryAllFailed() {
    for (const t of store.tasks) {
      if (t.status === 'error' && !t.isStale) retryTask(t.id)
    }
  }

  // ============== 内部执行 ==============

  /**
   * rt.uploadedBytes = 服务端已确认的已传字节（分片整块完成才累加）；
   * partUploadLoaded = 尚在飞行中的各分片已发送字节。展示层两者相加。
   */
  function flushUploadTelemetry(
    id: string,
    deltaCommittedBytes: number,
    multipartThrottle?: { last: number },
  ) {
    const rt = runtimeMap.get(id)
    if (!rt || rt.totalBytes <= 0) return

    const now = Date.now()
    if (deltaCommittedBytes !== 0) {
      rt.uploadedBytes += deltaCommittedBytes
      if (deltaCommittedBytes > 0) {
        rt.speedSamples.push({ ts: now, bytes: deltaCommittedBytes })
        const cutoff = now - 5000
        while (rt.speedSamples.length > 0 && rt.speedSamples[0].ts < cutoff) {
          rt.speedSamples.shift()
        }
      }
    }

    const inFlightSum = [...rt.partUploadLoaded.values()].reduce((a, b) => a + b, 0)
    const displayedUploaded = Math.min(rt.uploadedBytes + inFlightSum, rt.totalBytes)
    const nearEnd = displayedUploaded >= rt.totalBytes - 2
    if (
      multipartThrottle &&
      !nearEnd &&
      now - multipartThrottle.last < 55
    ) {
      return
    }
    if (multipartThrottle) multipartThrottle.last = now

    const totalDelta = rt.speedSamples.reduce((a, b) => a + b.bytes, 0)
    const span =
      rt.speedSamples.length > 0
        ? Math.max((now - rt.speedSamples[0].ts) / 1000, 0.05)
        : 0.05
    const speed = totalDelta / span
    const remaining = rt.totalBytes - displayedUploaded
    const eta = speed > 0 ? remaining / speed : null
    const progress = Math.min(
      99,
      Math.floor((displayedUploaded / rt.totalBytes) * 100),
    )
    store.updateTask(id, {
      uploadedBytes: displayedUploaded,
      speed,
      eta,
      progress,
    })
  }

  function recordSpeed(id: string, deltaBytes: number) {
    flushUploadTelemetry(id, deltaBytes, undefined)
  }

  async function runTask(id: string) {
    const task = store.tasks.find((t) => t.id === id)
    const rt = runtimeMap.get(id)
    if (!task || !rt) return

    try {
      // 1. 提取元数据
      store.updateTask(id, { status: 'preparing' })
      const meta = await extractMetadata(rt.file)
      if (rt.cancelled) return
      store.updateTask(id, {
        gpsData: meta.gpsData,
        dateTime: meta.dateTime,
        dateTimeSource: meta.dateTimeSource,
      })

      // 2. 计算哈希（如果没有缓存）
      if (!rt.fileHash) {
        store.updateTask(id, { status: 'hashing', hashProgress: 0 })
        const hash = await computeHashWithProgress(rt.file, (p) => {
          store.updateTask(id, { hashProgress: Math.floor(p * 100) })
        })
        if (rt.cancelled) return
        rt.fileHash = hash
        store.updateTask(id, { fileHash: hash, hashProgress: 100 })

        // 哈希后再做一次去重（基于 fileHash）
        const dup = store.tasks.find(
          (t) => t.id !== id && t.fileHash === hash && t.status !== 'error',
        )
        if (dup) {
          store.updateTask(id, {
            status: 'success',
            progress: 100,
            uploadedBytes: rt.totalBytes,
            speed: 0,
            eta: 0,
            errorMessage: '本地已存在同哈希任务',
            finishedAt: Date.now(),
          })
          rt.uploadedBytes = rt.totalBytes
          return
        }
      }

      if (rt.paused) {
        if (!rt.cancelled) store.updateTask(id, { status: 'paused' })
        return
      }

      // 3. initiate
      store.updateTask(id, { status: 'preparing' })
      const init = await initiateUpload({
        fileName: task.fileName,
        fileType: rt.fileType,
        fileSize: rt.totalBytes,
        fileHash: rt.fileHash!,
        dateTime: meta.dateTime,
        dateTimeSource: meta.dateTimeSource,
        gpsData: meta.gpsData,
      })
      // initiate 成功后端已落 metadata uploading 占位 / 申请 MPU；若用户已取消，必须通知后端清理
      if (rt.cancelled) {
        void cancelUpload({
          fileHash: rt.fileHash,
          objectKey: init.key,
          uploadId: init.uploadId,
        }).catch(() => {
          /* fire-and-forget：失败由后端定时任务兜底 */
        })
        return
      }

      rt.key = init.key
      rt.uploadId = init.uploadId
      rt.partSize = init.partSize
      store.updateTask(id, {
        objectKey: init.key,
        uploadId: init.uploadId,
        partSize: init.partSize,
      })

      // 3.1 命中秒传（已存在）
      if (init.alreadyExists && !init.url) {
        rt.uploadedBytes = rt.totalBytes
        store.updateTask(id, {
          status: 'success',
          progress: 100,
          uploadedBytes: rt.totalBytes,
          speed: 0,
          eta: 0,
          finishedAt: Date.now(),
        })
        return
      }

      // 3.2 直传（小文件或需要补传）
      if ((init.alreadyExists && init.url) || (init.directUpload && init.url)) {
        await runDirectUpload(id, init.url)
        return
      }

      // 3.3 分片上传
      await runMultipartUpload(id)
    } catch (err: any) {
      const cls = classifyError(err)
      if (cls === 'aborted') {
        // 暂停或重试时被取消
        const t = store.tasks.find((x) => x.id === id)
        if (t && (t.status === 'pausing' || t.status === 'paused')) {
          store.updateTask(id, { status: 'paused', speed: 0, eta: null })
        }
        return
      }
      const taskNow = store.tasks.find((x) => x.id === id)
      const newRetry = (taskNow?.retryCount ?? 0) + 1
      if (cls === 'fatal' || newRetry > TASK_MAX_RETRY) {
        store.updateTask(id, {
          status: 'error',
          errorMessage: err?.message || String(err) || '上传失败',
          speed: 0,
          eta: null,
        })
        return
      }
      store.updateTask(id, {
        retryCount: newRetry,
        errorMessage: `第 ${newRetry} 次重试中：${err?.message ?? err}`,
      })
      const backoff = Math.min(8000, 500 * 2 ** (newRetry - 1))
      await sleep(backoff)
      void runTask(id)
    }
  }

  async function runDirectUpload(id: string, url: string) {
    const task = store.tasks.find((t) => t.id === id)
    const rt = runtimeMap.get(id)
    if (!task || !rt) return
    store.updateTask(id, { status: 'uploading' })
    rt.abortController = new AbortController()
    await globalSemaphore.acquire()
    try {
      const directThrottle = { last: 0 }
      let markerLoaded = 0
      const result = await putBlobWithProgress(url, rt.file, {
        contentType: rt.fileType || undefined,
        signal: rt.abortController.signal,
        onUploadProgress: (loaded) => {
          const clamped = Math.min(loaded, rt.totalBytes)
          const nearEnd = clamped >= rt.totalBytes - 2
          const now = Date.now()
          if (!nearEnd && now - directThrottle.last < 55) return
          directThrottle.last = now
          const delta = clamped - markerLoaded
          markerLoaded = clamped
          if (delta > 0) {
            rt.speedSamples.push({ ts: now, bytes: delta })
            const cutoff = now - 5000
            while (rt.speedSamples.length > 0 && rt.speedSamples[0].ts < cutoff) {
              rt.speedSamples.shift()
            }
          }
          const totalDelta = rt.speedSamples.reduce((a, b) => a + b.bytes, 0)
          const span =
            rt.speedSamples.length > 0
              ? Math.max((now - rt.speedSamples[0].ts) / 1000, 0.05)
              : 0.05
          const speed = totalDelta / span
          const remaining = rt.totalBytes - clamped
          const eta = speed > 0 ? remaining / speed : null
          const progress = Math.min(99, Math.floor((clamped / rt.totalBytes) * 100))
          store.updateTask(id, {
            uploadedBytes: clamped,
            speed,
            eta,
            progress,
          })
        },
      })
      if (!result.ok) throw new Error(`直传失败: ${result.status}`)
      // PUT 已成功但用户取消：不写 digest，由 removeTask -> cancelUpload 删孤儿对象
      if (rt.cancelled) return
      rt.uploadedBytes = rt.totalBytes
      store.updateTask(id, {
        progress: 100,
        uploadedBytes: rt.totalBytes,
      })
      await completeDirectUpload({
        fileHash: rt.fileHash!,
        objectKey: rt.key!,
        fileType: rt.fileType,
        fileSize: rt.totalBytes,
      })
      if (rt.cancelled) return
      store.updateTask(id, {
        status: 'success',
        progress: 100,
        speed: 0,
        eta: 0,
        finishedAt: Date.now(),
      })
    } finally {
      globalSemaphore.release()
    }
  }

  async function runMultipartUpload(id: string) {
    const task = store.tasks.find((t) => t.id === id)
    const rt = runtimeMap.get(id)
    if (!task || !rt) return
    if (!rt.uploadId || !rt.key || !rt.partSize) {
      throw new Error('上传上下文不完整')
    }
    store.updateTask(id, { status: 'uploading' })

    // 切分
    rt.parts = createParts(rt.file, rt.partSize)
    // 拉取已上传分片
    const listed = await getParts({ key: rt.key, uploadId: rt.uploadId })
    const uploadedSet = new Set(listed.parts.map((p) => p.partNumber))
    rt.uploadedParts = [...listed.parts]

    // 已上传字节数
    const uploadedFromServer = listed.parts.length * rt.partSize
    rt.uploadedBytes = Math.min(uploadedFromServer, rt.totalBytes)
    rt.partUploadLoaded.clear()

    flushUploadTelemetry(id, 0, undefined)

    rt.abortController = new AbortController()

    const multipartProgressThrottle = { last: 0 }

    // 任务内并发上限 = min(2, 全局槽数)，每个 part-upload 仍走全局 semaphore
    const innerConcurrency = Math.min(2, store.concurrency)
    let cursor = 0
    let uploadError: any = null

    const tryRun = async () => {
      while (cursor < rt.parts.length) {
        if (rt.paused || uploadError) break
        const idx = cursor++
        const part = rt.parts[idx]
        if (uploadedSet.has(part.partNumber)) continue
        try {
          await uploadPartWithRetry(id, part, uploadedSet, multipartProgressThrottle)
        } catch (err) {
          uploadError = err
          break
        }
      }
    }

    const workers = []
    for (let i = 0; i < innerConcurrency; i++) workers.push(tryRun())
    await Promise.all(workers)

    if (rt.cancelled) return
    if (rt.paused) {
      store.updateTask(id, { status: 'paused', speed: 0, eta: null })
      return
    }
    if (uploadError) throw uploadError

    rt.uploadedParts.sort((a, b) => a.partNumber - b.partNumber)
    await completeUpload({
      hash: rt.fileHash!,
      key: rt.key!,
      uploadId: rt.uploadId!,
      fileType: rt.fileType,
      parts: rt.uploadedParts,
    })
    if (rt.cancelled) return
    rt.uploadedBytes = rt.totalBytes
    store.updateTask(id, {
      status: 'success',
      progress: 100,
      uploadedBytes: rt.totalBytes,
      speed: 0,
      eta: 0,
      finishedAt: Date.now(),
    })
  }

  async function uploadPartWithRetry(
    id: string,
    part: { partNumber: number; start: number; end: number },
    uploadedSet: Set<number>,
    multipartThrottle: { last: number },
  ) {
    const rt = runtimeMap.get(id)
    if (!rt) throw new Error('runtime missing')
    let attempt = 0
    while (true) {
      try {
        await globalSemaphore.acquire()
        try {
          if (rt.paused) throw Object.assign(new Error('aborted'), { name: 'AbortError' })
          const { url } = await getUploadUrl({
            key: rt.key!,
            uploadId: rt.uploadId!,
            partNumber: part.partNumber,
          })
          const blob = rt.file.slice(part.start, part.end)
          const res = await putBlobWithProgress(url, blob, {
            contentType: rt.fileType || undefined,
            signal: rt.abortController?.signal,
            onUploadProgress: (loaded) => {
              rt.partUploadLoaded.set(part.partNumber, loaded)
              flushUploadTelemetry(id, 0, multipartThrottle)
            },
          })
          if (!res.ok) throw new Error(`Part ${part.partNumber} 上传失败: ${res.status}`)
          rt.partUploadLoaded.delete(part.partNumber)
          rt.uploadedParts.push({ partNumber: part.partNumber, eTag: res.etag })
          uploadedSet.add(part.partNumber)
          recordSpeed(id, blob.size)
          return
        } finally {
          globalSemaphore.release()
        }
      } catch (err: any) {
        rt.partUploadLoaded.delete(part.partNumber)
        if (err?.name === 'AbortError') throw err
        attempt++
        if (attempt > FAILED_PART_RETRY) throw err
        const backoff = 500 * 2 ** (attempt - 1)
        await sleep(backoff)
      }
    }
  }

  /** 用户在 need-resume 状态下重新选择文件以续传 */
  async function tryAttachAndResume(taskId: string, file: File): Promise<boolean> {
    const task = store.tasks.find((t) => t.id === taskId)
    if (!task) return false
    if (file.name !== task.fileName || file.size !== task.fileSize) {
      store.updateTask(taskId, {
        errorMessage: '所选文件与原任务不匹配',
      })
      return false
    }
    // 询问后端 session 是否还在
    let canResume = false
    if (task.fileHash) {
      try {
        const sess = await getSessionByHash(task.fileHash)
        canResume = sess.status === 'active' || sess.status === 'completed'
      } catch {
        /* ignore */
      }
    }
    const fileType = task.fileType || getFileMimeType(file)
    runtimeMap.set(taskId, {
      file,
      fileType,
      paused: false,
      cancelled: false,
      speedSamples: [],
      uploadedBytes: 0,
      totalBytes: file.size,
      uploadedParts: [],
      parts: [],
      partUploadLoaded: new Map(),
      fileHash: task.fileHash,
      key: canResume ? task.objectKey : undefined,
      uploadId: canResume ? task.uploadId : undefined,
      partSize: canResume ? task.partSize : undefined,
    })
    ensureThumbnail(taskId, file, fileType)
    store.updateTask(taskId, {
      status: 'queued',
      isStale: false,
      errorMessage: undefined,
      retryCount: 0,
      progress: 0,
      hashProgress: task.fileHash ? 100 : 0,
      uploadedBytes: 0,
      speed: 0,
      eta: null,
    })
    void runTask(taskId)
    return true
  }

  return {
    enqueueFiles,
    attachFile,
    pauseTask,
    resumeTask,
    retryTask,
    removeTask,
    pauseAll,
    resumeAll,
    retryAllFailed,
    tryAttachAndResume,
  }
}
