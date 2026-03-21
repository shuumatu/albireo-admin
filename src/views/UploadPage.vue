<template>
  <div class="flex justify-center mt-20 px-4">
    <n-card
      class="w-full max-w-xl shadow-xl rounded-2xl"
      title="🎬 上传图片或视频"
      bordered
    >
      <div class="mb-6">
        <n-upload
          :custom-request="customUpload"
          :accept="'image/*,video/*'"
          list-type="image-card"
          :show-preview-button="true"
          :show-remove-button="true"
        >
                <div
            class="flex flex-col items-center justify-center p-10 border-2 border-dashed border-gray-300 rounded-xl hover:bg-gray-50 transition"
            >
            <n-icon size="40" class="mb-2 text-blue-500">
            <CloudUploadOutline />
            </n-icon>
            <br>
            <span class="text-gray-600">点击或拖拽上传</span>
        </div>
        </n-upload>

        <n-progress
          v-if="uploadProgress > 0 && uploadProgress < 100"
          type="line"
          :percentage="uploadProgress"
          status="active"
          style="margin-top: 20px"
        />
      </div>

      <div v-if="uploadedUrl" class="mt-6">
        <div v-if="uploadedUrl.endsWith('.mp4')" class="preview-container">
          <video
            controls
            :src="uploadedUrl"
            class="preview-media"
          />
        </div>
        <div v-else class="preview-container">
          <img
            :src="uploadedUrl"
            class="preview-media"
          />
        </div>
        <div class="text-center mt-2 text-sm text-gray-500">{{ fileName }}</div>
      </div>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useMessage, NIcon } from 'naive-ui'
import { CloudUploadOutline } from '@vicons/ionicons5'
import { initiateUpload, getParts, getUploadUrl, completeUpload, completeDirectUpload } from '../api/upload'

const uploadProgress = ref(0)
const uploadedUrl = ref('')
const fileName = ref('')
const message = useMessage()

function computeHash(file: File, chunkSize: number = 4 * 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/fileHashWorker.ts", import.meta.url), { type: "module" })
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

function getFileType(file: File, fileName: string): string {
  let fileType = file.type || ""
  if (!fileType || fileType === "unknown") {
    const ext = fileName.split('.').pop()?.toLowerCase()
    const mimeTypes: Record<string, string> = {
      'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
      'gif': 'image/gif', 'webp': 'image/webp', 'heic': 'image/heic',
      'heif': 'image/heif', 'mp4': 'video/mp4', 'mov': 'video/quicktime',
      'mkv': 'video/x-matroska', 'webm': 'video/webm', 'avi': 'video/x-msvideo',
    }
    fileType = mimeTypes[ext || ''] || 'application/octet-stream'
  }
  return fileType
}

const customUpload = async ({ file }: { file: any }) => {
  try {
    const actualFile: File = file.file || file
    const fileDisplayName = actualFile.name || file.name
    const fileType = getFileType(actualFile, fileDisplayName)

    console.log('开始上传文件:', fileDisplayName, '大小:', actualFile.size, '类型:', fileType)

    const fileHash = await computeHash(actualFile)
    console.log('文件哈希:', fileHash)

    const init = await initiateUpload({
      fileName: fileDisplayName,
      fileType,
      fileSize: actualFile.size,
      fileHash,
    })

    if (init.alreadyExists && !init.url) {
      console.log('文件已存在，跳过上传')
      message.success('文件已存在，秒传成功')
      uploadProgress.value = 100
      fileName.value = fileDisplayName
      return
    }

    if (init.alreadyExists && init.url || init.directUpload && init.url) {
      console.log('直传模式:', init.url)
      const resp = await fetch(init.url, { method: 'PUT', body: actualFile })
      if (!resp.ok) throw new Error('直接上传失败')
      await completeDirectUpload({ fileHash, objectKey: init.key, fileType })
      message.success('上传成功')
      uploadProgress.value = 100
      fileName.value = fileDisplayName
      return
    }

    // 分片上传
    const partSize = init.partSize
    const parts: { partNumber: number; start: number; end: number }[] = []
    let partNumber = 1
    for (let offset = 0; offset < actualFile.size; offset += partSize, partNumber++) {
      parts.push({ partNumber, start: offset, end: Math.min(offset + partSize, actualFile.size) })
    }

    const listed = await getParts({ key: init.key, uploadId: init.uploadId })
    const uploadedSet = new Set(listed.parts.map(p => p.partNumber))
    const uploadedParts = [...listed.parts]
    const totalParts = parts.length

    for (const part of parts) {
      if (uploadedSet.has(part.partNumber)) continue

      const { url } = await getUploadUrl({ key: init.key, uploadId: init.uploadId, partNumber: part.partNumber })
      const blob = actualFile.slice(part.start, part.end)
      const resp = await fetch(url, {
        method: 'PUT',
        body: blob,
        headers: fileType ? { 'Content-Type': fileType } : undefined,
      })
      if (!resp.ok) throw new Error(`分片 ${part.partNumber} 上传失败`)

      const eTag = (resp.headers.get('etag') || '').replaceAll('"', '')
      uploadedParts.push({ partNumber: part.partNumber, eTag })
      uploadedSet.add(part.partNumber)
      uploadProgress.value = Math.min(99, Math.floor((uploadedParts.length / totalParts) * 100))
    }

    uploadedParts.sort((a, b) => a.partNumber - b.partNumber)
    await completeUpload({
      hash: fileHash,
      key: init.key,
      uploadId: init.uploadId,
      fileType,
      parts: uploadedParts,
    })

    message.success('上传成功')
    uploadProgress.value = 100
    fileName.value = fileDisplayName

  } catch (err: any) {
    console.error('上传错误:', err)
    message.error(`上传失败: ${err.message || '未知错误'}`)
    uploadProgress.value = 0
  }
}
</script>

<style scoped>
.n-upload-trigger {
  width: 100%;
}

.preview-container {
  display: flex;
  justify-content: center;
  align-items: center;
  margin: 0 auto;
}

.preview-media {
  max-width: 100%;
  max-height: 60vh; /* 最大高度为视口高度的60% */
  width: auto;
  height: auto;
  border-radius: 12px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  object-fit: contain; /* 保持宽高比，完整显示内容 */
}

/* 针对图片的特殊处理 */
.preview-container img {
  object-fit: contain;
}

/* 针对视频的特殊处理 */
.preview-container video {
  object-fit: contain;
}
</style>
