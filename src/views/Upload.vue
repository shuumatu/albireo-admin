<template>
  <n-upload
    directory-dnd
    multiple
    :custom-request="handleCustomRequest"
    :show-file-list="false"
  >
    <n-upload-dragger>
      <div style="margin-bottom: 12px">
        <n-icon size="48" :depth="3">
          <ArchiveIcon />
        </n-icon>
      </div>
      <n-text style="font-size: 16px">
        点击或者拖动文件到该区域来上传
      </n-text>
      <n-p depth="3" style="margin: 8px 0 0 0">
        支持批量上传，可暂停/继续
      </n-p>
    </n-upload-dragger>
  </n-upload>

  <!-- 文件上传列表 -->
  <div v-if="uploadTasks.length > 0" class="mt-4 space-y-3">
    <n-card
      v-for="task in uploadTasks"
      :key="task.id"
      size="small"
      :bordered="true"
    >
      <div class="flex items-center justify-between">
        <div class="flex-1 mr-4">
          <div class="flex items-center justify-between mb-2">
            <span class="font-medium text-sm truncate">{{ task.fileName }}</span>
            <n-tag
              :type="getStatusType(task.status)"
              size="small"
              class="ml-2"
            >
              {{ getStatusText(task.status) }}
            </n-tag>
          </div>
          
          <n-progress
            :percentage="task.progress"
            :status="task.status === 'error' ? 'error' : task.status === 'success' ? 'success' : 'default'"
            :show-indicator="false"
          />
          
          <div class="flex items-center justify-between mt-1 text-xs text-gray-500">
            <span>{{ task.progress }}%</span>
            <span v-if="task.speed">{{ task.speed }}</span>
          </div>
          
          <div v-if="task.errorMessage" class="mt-2 text-xs text-red-500">
            {{ task.errorMessage }}
          </div>
        </div>
        
        <div class="flex gap-2">
          <!-- 暂停/继续按钮 -->
          <n-button
            v-if="task.status === 'uploading'"
            size="small"
            @click="pauseUpload(task.id)"
            :disabled="task.status === 'pausing'"
          >
            <template #icon>
              <n-icon><PauseIcon /></n-icon>
            </template>
          </n-button>
          
          <n-button
            v-if="task.status === 'paused'"
            size="small"
            type="primary"
            @click="resumeUpload(task.id)"
          >
            <template #icon>
              <n-icon><PlayIcon /></n-icon>
            </template>
          </n-button>
          
          <!-- 重试按钮 -->
          <n-button
            v-if="task.status === 'error'"
            size="small"
            type="warning"
            @click="retryUpload(task.id)"
          >
            <template #icon>
              <n-icon><RefreshIcon /></n-icon>
            </template>
          </n-button>
          
          <!-- 删除按钮 -->
          <n-button
            v-if="task.status === 'success' || task.status === 'error' || task.status === 'paused'"
            size="small"
            type="error"
            @click="removeTask(task.id)"
          >
            <template #icon>
              <n-icon><CloseIcon /></n-icon>
            </template>
          </n-button>
        </div>
      </div>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { 
  ArchiveOutline as ArchiveIcon,
  PauseCircleOutline as PauseIcon,
  PlayCircleOutline as PlayIcon,
  RefreshOutline as RefreshIcon,
  CloseCircleOutline as CloseIcon
} from '@vicons/ionicons5'
import { initiateUpload, getParts, getUploadUrl, completeUpload, completeDirectUpload } from '../api/upload'
import type { UploadCustomRequestOptions } from 'naive-ui'
import ExifReader from 'exifreader'

interface UploadTask {
  id: string
  fileName: string
  fileSize: number
  file: File
  status: 'uploading' | 'paused' | 'pausing' | 'success' | 'error'
  progress: number
  speed?: string
  errorMessage?: string
  gpsData?: {  // 添加这个属性
    latitude: number
    longitude: number
    altitude: number | null
    dateTime?: string
  } | null
  uploadContext?: {
    key: string
    uploadId: string
    partSize: number
    fileHash: string
    parts: Array<{ partNumber: number; start: number; end: number }>
    uploadedParts: Array<{ partNumber: number; eTag: string }>
    abortController?: AbortController
  }
}

const uploadTasks = ref<UploadTask[]>([])

function computeHash(file: File, chunkSize: number = 4 * 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/fileHashWorker.ts", import.meta.url), {
      type: "module",
    })

    worker.onmessage = (e) => {
      const { status, hash, error } = e.data
      if (status === "done") {
        resolve(hash)
        worker.terminate()
      } else if (status === "error") {
        reject(error)
        worker.terminate()
      }
    }

    worker.postMessage({ file, chunkSize })
  })
}

function createParts(file: File, partSize: number) {
  const parts: Array<{ partNumber: number; start: number; end: number }> = []
  let partNumber = 1
  for (let offset = 0; offset < file.size; offset += partSize, partNumber++) {
    parts.push({
      partNumber,
      start: offset,
      end: Math.min(offset + partSize, file.size)
    })
  }
  return parts
}

function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(0)} B/s`
  if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(2)} KB/s`
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(2)} MB/s`
}

async function handleCustomRequest({ file }: UploadCustomRequestOptions) {
  if (!file.file) return

  const taskId = Date.now().toString() + Math.random().toString(36).substr(2, 9)
  const task: UploadTask = {
    id: taskId,
    fileName: file.name,
    fileSize: file.file.size,
    file: file.file,
    status: 'uploading',
    progress: 0
  }

  uploadTasks.value.push(task)

  try {
    await performUpload(task)
  } catch (err: any) {
    console.error("上传失败", err)
    updateTaskStatus(taskId, 'error', err.message || '上传失败')
  }
}

async function performUpload(task: UploadTask) {
  const startTime = Date.now()
  let lastLoaded = 0
  let lastTime = startTime

  try {
    // ===== 提取 GPS 信息(修正版) =====
    let gpsData = null
    try {
      const tags = await ExifReader.load(task.file)
      
      const gpsLatitude = tags['GPSLatitude']?.description
      const gpsLongitude = tags['GPSLongitude']?.description
      const gpsAltitude = tags['GPSAltitude']?.description
      const dateTime = tags['DateTime']?.description || tags['DateTimeOriginal']?.description
      
      console.log('原始GPS数据:', {
        latitude: gpsLatitude,
        longitude: gpsLongitude,
        altitude: gpsAltitude
      })
      
      if (gpsLatitude != null && gpsLongitude != null) {
        // 处理纬度和经度 - 可能是数字或字符串
        let latitude: number
        let longitude: number
        
        if (typeof gpsLatitude === 'number') {
          latitude = gpsLatitude
        } else {
          latitude = parseFloat(gpsLatitude.toString().replace('°', ''))
        }
        
        if (typeof gpsLongitude === 'number') {
          longitude = gpsLongitude
        } else {
          longitude = parseFloat(gpsLongitude.toString().replace('°', ''))
        }
        
        // 处理海拔 - 可能包含单位 "0 m"
        let altitude: number | null = null
        if (gpsAltitude) {
          const altStr = gpsAltitude.toString().replace(/[^\d.-]/g, '') // 移除所有非数字字符
          const altNum = parseFloat(altStr)
          altitude = !isNaN(altNum) ? altNum : null
        }
        
        if (!isNaN(latitude) && !isNaN(longitude)) {
          gpsData = {
            latitude,
            longitude,
            altitude,
            dateTime
          }
          
          // 保存到 task 对象
          const currentTask = uploadTasks.value.find(t => t.id === task.id)
          if (currentTask) {
            currentTask.gpsData = gpsData
          }
          
          console.log('成功提取 GPS 信息:', gpsData)
        }
      } else {
        console.log('文件不包含 GPS 信息')
      }
    } catch (exifError) {
      console.error('❌ 读取 EXIF 信息失败:', exifError)
    }
    // ===== GPS 提取结束 =====



    // 计算文件哈希
    const fileHash = await computeHash(task.file)
    console.log("文件 hash:", fileHash)

    // 初始化上传
    const init = await initiateUpload({
      fileName: task.fileName,
      fileType: task.file.type || "",
      fileSize: task.file.size,
      fileHash: fileHash,
      gpsData: gpsData // 新增：传递 GPS 数据
    })

    if (init.alreadyExists) {
      console.log("文件已存在，无需上传")
      updateTaskProgress(task.id, 100)
      updateTaskStatus(task.id, 'success')
      return
    }

    if (init.directUpload && init.url) {
      // 直接上传
      const abortController = new AbortController()
      const currentTask = uploadTasks.value.find(t => t.id === task.id)
      if (currentTask) {
        currentTask.uploadContext = { 
          key: init.key, 
          uploadId: '', 
          partSize: 0, 
          fileHash, 
          parts: [], 
          uploadedParts: [],
          abortController 
        }
      }

      const resp = await fetch(init.url, { 
        method: 'PUT', 
        body: task.file,
        signal: abortController.signal
      })
      
      if (!resp.ok) throw new Error('直接上传失败')
      
      await completeDirectUpload({ fileHash, objectKey: init.key, fileType: task.file.type || "" })
      updateTaskProgress(task.id, 100)
      updateTaskStatus(task.id, 'success')
      return
    }

    // 分片上传
    const parts = createParts(task.file, init.partSize)
    const listed = await getParts({ key: init.key, uploadId: init.uploadId })
    const uploadedSet = new Set<number>(listed.parts.map(p => p.partNumber))
    const uploadedParts = listed.parts.map(p => ({ partNumber: p.partNumber, eTag: p.eTag }))

    const totalParts = parts.length
    let doneCount = uploadedSet.size

    // 保存上传上下文
    const currentTask = uploadTasks.value.find(t => t.id === task.id)
    if (currentTask) {
      currentTask.uploadContext = {
        key: init.key,
        uploadId: init.uploadId,
        partSize: init.partSize,
        fileHash,
        parts,
        uploadedParts,
        abortController: new AbortController()
      }
    }

    updateTaskProgress(task.id, Math.floor((doneCount / totalParts) * 100))

    // 并发上传
    const uploadedAll = await uploadWithConcurrency(
      task.id,
      parts,
      task.file,
      init.key,
      init.uploadId,
      uploadedSet,
      6,
      (progress, loaded) => {
        updateTaskProgress(task.id, progress)
        
        // 计算速度
        const now = Date.now()
        const timeDiff = (now - lastTime) / 1000
        if (timeDiff > 0.5) {
          const speed = (loaded - lastLoaded) / timeDiff
          const currentTask = uploadTasks.value.find(t => t.id === task.id)
          if (currentTask) {
            currentTask.speed = formatSpeed(speed)
          }
          lastLoaded = loaded
          lastTime = now
        }
      }
    )

    // 完成上传
    uploadedAll.sort((a, b) => a.partNumber - b.partNumber)
    await completeUpload({ 
      hash: fileHash, 
      key: init.key, 
      uploadId: init.uploadId, 
      fileType: task.file.type || "", 
      parts: uploadedAll 
    })

    updateTaskProgress(task.id, 100)
    updateTaskStatus(task.id, 'success')

  } catch (err: any) {
    if (err.name === 'AbortError') {
      // 用户主动暂停，不设置为错误
      return
    }
    throw err
  }
}

async function uploadWithConcurrency(
  taskId: string,
  parts: { partNumber: number; start: number; end: number }[],
  file: File,
  key: string,
  uploadId: string,
  uploadedSet: Set<number>,
  concurrency: number,
  onProgress?: (percent: number, loaded: number) => void
) {
  const task = uploadTasks.value.find(t => t.id === taskId)
  if (!task || !task.uploadContext) throw new Error('任务不存在')

  const uploadedAll = [...task.uploadContext.uploadedParts]
  const totalParts = parts.length
  let doneCount = uploadedSet.size
  let totalLoaded = doneCount * task.uploadContext.partSize

  let i = 0
  const run = async () => {
    while (i < parts.length) {
      const currentTask = uploadTasks.value.find(t => t.id === taskId)
      if (!currentTask) break
      if (currentTask.status === 'paused' || currentTask.status === 'pausing') break

      const part = parts[i++]
      if (uploadedSet.has(part.partNumber)) continue

      const { url } = await getUploadUrl({
        key,
        uploadId,
        partNumber: part.partNumber,
      })

      const blob = file.slice(part.start, part.end)
      const resp = await fetch(url, {
        method: "PUT",
        body: blob,
        headers: file.type ? { "Content-Type": file.type } : undefined,
        signal: currentTask.uploadContext?.abortController?.signal
      })

      if (!resp.ok) throw new Error(`Part ${part.partNumber} upload failed`)

      const etagHeader = resp.headers.get("etag") || ""
      const eTag = etagHeader.replaceAll('"', "")
      uploadedAll.push({ partNumber: part.partNumber, eTag })

      // 保存已上传的分片
      if (currentTask.uploadContext) {
        currentTask.uploadContext.uploadedParts = [...uploadedAll]
      }

      doneCount++
      totalLoaded += blob.size
      onProgress?.(
        Math.min(99, Math.floor((doneCount / totalParts) * 100)),
        totalLoaded
      )
    }
  }

  const pool = []
  for (let j = 0; j < concurrency && j < parts.length; j++) {
    pool.push(run())
  }
  await Promise.all(pool)

  return uploadedAll
}

function updateTaskProgress(taskId: string, progress: number) {
  const task = uploadTasks.value.find(t => t.id === taskId)
  if (task) {
    task.progress = progress
  }
}

function updateTaskStatus(taskId: string, status: UploadTask['status'], errorMessage?: string) {
  const task = uploadTasks.value.find(t => t.id === taskId)
  if (task) {
    task.status = status
    if (errorMessage) {
      task.errorMessage = errorMessage
    }
  }
}

function pauseUpload(taskId: string) {
  const task = uploadTasks.value.find(t => t.id === taskId)
  if (task && task.status === 'uploading') {
    task.status = 'pausing'
    task.uploadContext?.abortController?.abort()
    setTimeout(() => {
      updateTaskStatus(taskId, 'paused')
    }, 100)
  }
}

async function resumeUpload(taskId: string) {
  const task = uploadTasks.value.find(t => t.id === taskId)
  if (task && task.status === 'paused' && task.uploadContext) {
    task.status = 'uploading'
    task.uploadContext.abortController = new AbortController()
    
    try {
      const uploadedSet = new Set<number>(task.uploadContext.uploadedParts.map(p => p.partNumber))
      const totalParts = task.uploadContext.parts.length
      let doneCount = uploadedSet.size

      updateTaskProgress(taskId, Math.floor((doneCount / totalParts) * 100))

      const uploadedAll = await uploadWithConcurrency(
        taskId,
        task.uploadContext.parts,
        task.file,
        task.uploadContext.key,
        task.uploadContext.uploadId,
        uploadedSet,
        6,
        (progress) => updateTaskProgress(taskId, progress)
      )

      uploadedAll.sort((a, b) => a.partNumber - b.partNumber)
      await completeUpload({
        hash: task.uploadContext.fileHash,
        key: task.uploadContext.key,
        uploadId: task.uploadContext.uploadId,
        fileType: task.file.type || "",
        parts: uploadedAll
      })

      updateTaskProgress(taskId, 100)
      updateTaskStatus(taskId, 'success')
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        updateTaskStatus(taskId, 'error', err.message || '上传失败')
      }
    }
  }
}

async function retryUpload(taskId: string) {
  const task = uploadTasks.value.find(t => t.id === taskId)
  if (task && task.status === 'error') {
    task.status = 'uploading'
    task.progress = 0
    task.errorMessage = ''
    task.uploadContext = undefined
    
    try {
      await performUpload(task)
    } catch (err: any) {
      updateTaskStatus(taskId, 'error', err.message || '上传失败')
    }
  }
}

function removeTask(taskId: string) {
  const index = uploadTasks.value.findIndex(t => t.id === taskId)
  if (index !== -1) {
    uploadTasks.value.splice(index, 1)
  }
}

function getStatusType(status: UploadTask['status']) {
  switch (status) {
    case 'uploading': return 'info'
    case 'paused': return 'warning'
    case 'pausing': return 'warning'
    case 'success': return 'success'
    case 'error': return 'error'
    default: return 'default'
  }
}

function getStatusText(status: UploadTask['status']) {
  switch (status) {
    case 'uploading': return '上传中'
    case 'paused': return '已暂停'
    case 'pausing': return '暂停中'
    case 'success': return '已完成'
    case 'error': return '失败'
    default: return '未知'
  }
}

// 转换 GPS 坐标格式
const convertGPSToDecimal = (gpsCoords: number[] | undefined, ref: string | undefined): number | null => {
  if (!gpsCoords || gpsCoords.length !== 3) return null
  
  const degrees = gpsCoords[0]
  const minutes = gpsCoords[1]
  const seconds = gpsCoords[2]
  
  // 计算十进制度数
  let decimal = degrees + (minutes / 60) + (seconds / 3600)
  
  // 根据方向调整符号
  if (ref === 'S' || ref === 'W') {
    decimal = -decimal
  }
  
  return decimal
}

</script>

<style scoped>
.space-y-3 > * + * {
  margin-top: 0.75rem;
}
</style>