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

import axios from 'axios'

const uploadProgress = ref(0)
const uploadedUrl = ref('')
const fileName = ref('')
const message = useMessage()

const customUpload = async ({ file }: { file: any }) => {
  try {
    // 处理 Naive UI 的文件对象格式
    const actualFile = file.file || file
    const fileDisplayName = actualFile.name || file.name
    const fileSize = actualFile.size || file.size || 0
    const fileType = actualFile.type || file.type || 'application/octet-stream'
    
    console.log('开始上传文件:', fileDisplayName, '大小:', fileSize, '类型:', fileType)
    console.log('文件对象:', actualFile)
    
    // 获取预签名URL
    const { data } = await axios.post('http://localhost:8081/api/upload-url', {
      fileName: fileDisplayName,
      fileType: fileType,
    })
    
    console.log('获取到预签名URL:', data.url)

    // 上传文件到存储桶
    const uploadResponse = await axios.put(data.url, actualFile, {
      headers: {
        'Content-Type': fileType,
        // 移除 Content-Length，让浏览器自动设置
      },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total) {
          uploadProgress.value = Math.round((progressEvent.loaded * 100) / progressEvent.total)
        }
      },
    })
    
    console.log('上传响应:', uploadResponse.status, uploadResponse.statusText)

    // 构建访问URL（使用自定义域名）
    const cloudflareUrl = data.url.split('?')[0]
    const objectKey = data.key || cloudflareUrl.split('/uploads/')[1]
    const accessUrl = `https://albireo.shuumatu.com/${objectKey}`
    console.log('访问URL:', accessUrl)
    
    message.success('上传成功')
    uploadedUrl.value = accessUrl
    fileName.value = fileDisplayName
    uploadProgress.value = 100
    
  } catch (err: any) {
    console.error('上传错误:', err)
    if (err.response) {
      console.error('错误响应:', err.response.status, err.response.data)
      message.error(`上传失败: ${err.response.status} - ${err.response.data?.message || '未知错误'}`)
    } else if (err.request) {
      console.error('请求错误:', err.request)
      message.error('上传失败: 网络请求错误')
    } else {
      console.error('其他错误:', err.message)
      message.error(`上传失败: ${err.message}`)
    }
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
