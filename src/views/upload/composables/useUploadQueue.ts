import { onMounted, onBeforeUnmount, watch } from 'vue'
import exifr from 'exifr'
import {
  initiateUpload,
  getParts,
  getUploadUrl,
  completeUpload,
  completeDirectUpload,
  getSessionByHash,
  type PartETagDTO,
  type GpsData,
} from '../../../api/upload'
import { useUploadStore, type UploadTask } from '../../../stores/uploadStore'

interface Runtime {
  file: File
  fileType: string
  abortController?: AbortController
  paused: boolean
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

  /** 加入一组文件（去重 + 自动开跑） */
  async function enqueueFiles(files: File[]) {
    for (const file of files) {
      // 去重 1：本地 name+size 临时拦截（hash 阶段再做严格判断）
      const dup = store.findByNameSize(file.name, file.size)
      if (dup && dup.status !== 'error' && !dup.isStale) continue

      const id = uid()
      const fileType = getFileMimeType(file)
      const task: UploadTask = {
        id,
        fileName: file.name,
        fileSize: file.size,
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
        speedSamples: [],
        uploadedBytes: 0,
        totalBytes: file.size,
        uploadedParts: [],
        parts: [],
      })
      store.addTask(task)
      // 不 await，串行启动会拖慢 UI
      void runTask(id)
    }
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
    runtimeMap.set(taskId, {
      file,
      fileType: task.fileType || getFileMimeType(file),
      paused: false,
      speedSamples: [],
      uploadedBytes: 0,
      totalBytes: file.size,
      uploadedParts: [],
      parts: [],
    })
    store.updateTask(taskId, {
      status: 'queued',
      isStale: false,
      errorMessage: undefined,
      retryCount: 0,
    })
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
    rt.key = undefined
    rt.uploadId = undefined
    void runTask(id)
  }

  function removeTask(id: string) {
    runtimeMap.delete(id)
    store.removeTask(id)
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

  function recordSpeed(id: string, deltaBytes: number) {
    const rt = runtimeMap.get(id)
    if (!rt) return
    const now = Date.now()
    rt.uploadedBytes += deltaBytes
    rt.speedSamples.push({ ts: now, bytes: deltaBytes })
    // 修剪窗口为最近 5 秒
    const cutoff = now - 5000
    while (rt.speedSamples.length > 0 && rt.speedSamples[0].ts < cutoff) {
      rt.speedSamples.shift()
    }
    const totalDelta = rt.speedSamples.reduce((a, b) => a + b.bytes, 0)
    const span =
      rt.speedSamples.length > 0
        ? Math.max((now - rt.speedSamples[0].ts) / 1000, 0.05)
        : 0.05
    const speed = totalDelta / span
    const remaining = rt.totalBytes - rt.uploadedBytes
    const eta = speed > 0 ? remaining / speed : null
    const progress = Math.min(99, Math.floor((rt.uploadedBytes / rt.totalBytes) * 100))
    store.updateTask(id, {
      uploadedBytes: rt.uploadedBytes,
      speed,
      eta,
      progress,
    })
  }

  async function runTask(id: string) {
    const task = store.tasks.find((t) => t.id === id)
    const rt = runtimeMap.get(id)
    if (!task || !rt) return

    try {
      // 1. 提取元数据
      store.updateTask(id, { status: 'preparing' })
      const meta = await extractMetadata(rt.file)
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
        store.updateTask(id, { status: 'paused' })
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
      const resp = await fetch(url, {
        method: 'PUT',
        body: rt.file,
        signal: rt.abortController.signal,
      })
      if (!resp.ok) throw new Error(`直传失败: ${resp.status}`)
      // 简化：直传不切片，进度直接 100
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
    store.updateTask(id, {
      uploadedBytes: rt.uploadedBytes,
      progress: Math.min(99, Math.floor((rt.uploadedBytes / rt.totalBytes) * 100)),
    })

    rt.abortController = new AbortController()

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
          await uploadPartWithRetry(id, part, uploadedSet)
        } catch (err) {
          uploadError = err
          break
        }
      }
    }

    const workers = []
    for (let i = 0; i < innerConcurrency; i++) workers.push(tryRun())
    await Promise.all(workers)

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
          const resp = await fetch(url, {
            method: 'PUT',
            body: blob,
            headers: rt.fileType ? { 'Content-Type': rt.fileType } : undefined,
            signal: rt.abortController?.signal,
          })
          if (!resp.ok) throw new Error(`Part ${part.partNumber} 上传失败: ${resp.status}`)
          const eTag = (resp.headers.get('etag') || '').replaceAll('"', '')
          rt.uploadedParts.push({ partNumber: part.partNumber, eTag })
          uploadedSet.add(part.partNumber)
          recordSpeed(id, blob.size)
          return
        } finally {
          globalSemaphore.release()
        }
      } catch (err: any) {
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
    runtimeMap.set(taskId, {
      file,
      fileType: task.fileType || getFileMimeType(file),
      paused: false,
      speedSamples: [],
      uploadedBytes: 0,
      totalBytes: file.size,
      uploadedParts: [],
      parts: [],
      fileHash: task.fileHash,
      key: canResume ? task.objectKey : undefined,
      uploadId: canResume ? task.uploadId : undefined,
      partSize: canResume ? task.partSize : undefined,
    })
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
