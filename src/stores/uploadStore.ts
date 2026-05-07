import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export type UploadStatus =
  | 'queued'        // 已加入队列、等待开始
  | 'hashing'       // 正在计算文件哈希
  | 'preparing'     // 正在调用 initiate / 协商上传策略
  | 'uploading'     // 正在传输分片
  | 'pausing'       // 用户已点击暂停，等待 in-flight 分片中止
  | 'paused'        // 已暂停
  | 'success'       // 完成
  | 'error'         // 失败（达到最大重试次数）
  | 'need-resume'   // 页面刷新后需要用户重新选择文件以恢复

export interface GpsData {
  latitude: number
  longitude: number
  altitude: number | null
}

export interface UploadTask {
  id: string
  fileName: string
  fileSize: number
  /**
   * 文件 lastModified 毫秒时间戳，仅作为「弱去重」第三因子使用：
   * 同名同大小但内容不同的文件（用户改动后另存为同名）很可能 lastModified 不同，
   * 用它兜底可以避免误把第二份内容静默跳过；最终去重仍以 hash 为准。
   */
  lastModified?: number
  fileType: string
  fileHash?: string
  uploadId?: string
  objectKey?: string
  partSize?: number
  status: UploadStatus
  progress: number          // 0-100，上传进度
  hashProgress: number      // 0-100，哈希进度
  uploadedBytes: number
  speed: number             // bytes/sec
  eta: number | null        // 秒
  errorMessage?: string
  createdAt: number
  finishedAt?: number
  retryCount: number
  isStale?: boolean         // 刷新页面后该任务的 File 已丢失
  /**
   * 持久化的小尺寸缩略图 dataURL（JPEG），用于刷新页面后 File 丢失时兜底显示。
   * 仅在文件入队/恢复时生成一次，体积控制在 ~32KB 以内。
   */
  thumbnailDataUrl?: string
  gpsData?: GpsData | null
  dateTime?: string
  dateTimeSource?: 'exif' | 'file'
}

export type FilterStatus = 'all' | 'active' | 'paused' | 'failed' | 'completed'
export type SortKey = 'createdAt' | 'size' | 'progress'

const ACTIVE_STATUSES: UploadStatus[] = ['uploading', 'hashing', 'preparing', 'queued']
const RUNNING_STATUSES: UploadStatus[] = ['uploading', 'hashing', 'preparing', 'pausing']

export const useUploadStore = defineStore(
  'upload',
  () => {
    const tasks = ref<UploadTask[]>([])
    const concurrency = ref(4) // 全局分片并发槽
    const filter = ref<FilterStatus>('all')
    const sortKey = ref<SortKey>('createdAt')
    const sortAsc = ref(false)

    const stats = computed(() => {
      let queued = 0
      let uploading = 0
      let completed = 0
      let failed = 0
      let paused = 0
      let totalBytes = 0
      let uploadedBytes = 0
      let aggregateSpeed = 0
      for (const t of tasks.value) {
        totalBytes += t.fileSize
        uploadedBytes += t.uploadedBytes
        if (t.status === 'uploading') aggregateSpeed += t.speed
        if (t.status === 'success') completed++
        else if (t.status === 'error') failed++
        else if (t.status === 'paused' || t.status === 'pausing') paused++
        else if (
          t.status === 'uploading' ||
          t.status === 'hashing' ||
          t.status === 'preparing'
        )
          uploading++
        else queued++
      }
      const remainingBytes = Math.max(totalBytes - uploadedBytes, 0)
      const eta = aggregateSpeed > 0 ? remainingBytes / aggregateSpeed : null
      return {
        queued,
        uploading,
        completed,
        failed,
        paused,
        total: tasks.value.length,
        totalBytes,
        uploadedBytes,
        overallPercent:
          totalBytes > 0 ? Math.floor((uploadedBytes / totalBytes) * 100) : 0,
        aggregateSpeed,
        eta,
      }
    })

    const visibleTasks = computed(() => {
      let arr = tasks.value
      if (filter.value !== 'all') {
        arr = arr.filter((t) => {
          switch (filter.value) {
            case 'active':
              return ACTIVE_STATUSES.includes(t.status)
            case 'paused':
              return t.status === 'paused' || t.status === 'pausing'
            case 'failed':
              return t.status === 'error' || t.status === 'need-resume'
            case 'completed':
              return t.status === 'success'
            default:
              return true
          }
        })
      }
      const sorted = [...arr]
      sorted.sort((a, b) => {
        let cmp = 0
        switch (sortKey.value) {
          case 'createdAt':
            cmp = a.createdAt - b.createdAt
            break
          case 'size':
            cmp = a.fileSize - b.fileSize
            break
          case 'progress':
            cmp = a.progress - b.progress
            break
        }
        return sortAsc.value ? cmp : -cmp
      })
      return sorted
    })

    function addTask(task: UploadTask) {
      tasks.value.push(task)
    }

    function removeTask(id: string) {
      const idx = tasks.value.findIndex((t) => t.id === id)
      if (idx >= 0) tasks.value.splice(idx, 1)
    }

    function updateTask(id: string, patch: Partial<UploadTask>) {
      const t = tasks.value.find((x) => x.id === id)
      if (t) Object.assign(t, patch)
    }

    function clearCompleted() {
      tasks.value = tasks.value.filter((t) => t.status !== 'success')
    }

    function findByHash(hash: string): UploadTask | undefined {
      return tasks.value.find((t) => t.fileHash === hash)
    }

    /**
     * 弱去重：name + size [+ lastModified]。
     * 如果传了 lastModified 且 store 中目标任务也带 lastModified，则三者都需相等才算重复，
     * 防止「同名同大小但内容已改」的文件被误跳过；权威去重仍由后续 hash 阶段完成。
     */
    function findByNameSize(
      fileName: string,
      fileSize: number,
      lastModified?: number,
    ): UploadTask | undefined {
      return tasks.value.find((t) => {
        if (t.fileName !== fileName || t.fileSize !== fileSize) return false
        if (lastModified == null || t.lastModified == null) return true
        return t.lastModified === lastModified
      })
    }

    function hasRunningTasks(): boolean {
      return tasks.value.some((t) => RUNNING_STATUSES.includes(t.status))
    }

    /**
     * 页面刷新或路由切回后，把所有非终态、且需要 File 引用才能继续的任务标记为 need-resume。
     *
     * 范围：running（uploading / hashing / preparing / pausing）+ queued + paused。
     * 之所以也要包含 queued / paused：刷新后模块级 runtimeMap 为空，这些任务即便状态文字
     * 仍是「排队中 / 已暂停」，但点「继续」会因为 rt 缺失而 no-op，造成「按钮没反应」的僵死。
     * success / error / need-resume 保持不变。
     */
    function markRunningAsStale() {
      const STALE_TARGETS: UploadStatus[] = [
        'uploading',
        'hashing',
        'preparing',
        'pausing',
        'queued',
        'paused',
      ]
      for (const t of tasks.value) {
        if (STALE_TARGETS.includes(t.status)) {
          t.status = 'need-resume'
          t.isStale = true
          t.speed = 0
          t.eta = null
        }
      }
    }

    return {
      tasks,
      concurrency,
      filter,
      sortKey,
      sortAsc,
      stats,
      visibleTasks,
      addTask,
      removeTask,
      updateTask,
      clearCompleted,
      findByHash,
      findByNameSize,
      hasRunningTasks,
      markRunningAsStale,
    }
  },
  {
    persist: {
      pick: ['tasks', 'concurrency', 'filter', 'sortKey', 'sortAsc'],
    },
  },
)
