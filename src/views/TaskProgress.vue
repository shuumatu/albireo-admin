<template>
  <n-flex vertical style="padding: 0 32px;">
    <n-flex justify="space-between" align="center" class="mb-4" style="width: 100%;">
      <n-flex align="center" :wrap="false">
        <h2>处理进度</h2>
        <n-tag v-if="tasks.length > 0" type="info" size="small" round>
          {{ tasks.length }} 个任务
        </n-tag>
      </n-flex>
      <n-flex align="center" :wrap="false">
        <n-switch v-model:value="autoRefresh" size="small" />
        <span style="font-size: 13px; color: #999; white-space: nowrap;">自动刷新</span>
        <n-button :loading="loading" @click="fetchTasks" size="small">刷新</n-button>
      </n-flex>
    </n-flex>

    <!-- 空状态 -->
    <n-empty v-if="!loading && tasks.length === 0" description="当前没有处理中的任务" style="margin-top: 80px;" />

    <!-- 任务卡片列表 -->
    <n-flex vertical :size="12" v-if="tasks.length > 0">
      <div
        v-for="task in tasks"
        :key="task.hash"
        class="task-card"
      >
        <n-flex align="center" justify="space-between" style="width: 100%;">
          <!-- 左侧：图标 + 文件信息 -->
          <n-flex align="center" :size="12" :wrap="false" style="min-width: 0; flex: 1;">
            <div class="type-icon" :class="task.type">
              {{ task.type === 'video' ? '🎬' : '🖼️' }}
            </div>
            <n-flex vertical :size="4" style="min-width: 0; flex: 1;">
              <n-ellipsis style="font-weight: 500; font-size: 14px;">
                {{ task.fileName }}
              </n-ellipsis>
              <n-flex :size="8" align="center">
                <n-tag :type="typeTagType(task.type)" size="tiny" round>
                  {{ task.type === 'video' ? '视频' : '图片' }}
                </n-tag>
                <span class="time-text">{{ formatTime(task.createdAt) }}</span>
              </n-flex>
            </n-flex>
          </n-flex>

          <!-- 右侧：状态 + 进度 -->
          <n-flex align="center" :size="16" :wrap="false">
            <n-flex vertical :size="4" align="flex-end">
              <n-tag :type="statusTagType(task.status)" size="small" round :bordered="false">
                <template #icon>
                  <span class="status-dot" :class="task.status" />
                </template>
                {{ statusLabel(task.status) }}
              </n-tag>
              <div class="step-bar">
                <div
                  v-for="(step, i) in getSteps(task)"
                  :key="i"
                  class="step-segment"
                  :class="{ active: step.active, done: step.done }"
                />
              </div>
            </n-flex>
          </n-flex>
        </n-flex>
      </div>
    </n-flex>
  </n-flex>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useMessage } from 'naive-ui'
import { fetchProcessingTasks, type TaskProgressVO } from '../api/task'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-cn'

dayjs.extend(relativeTime)
dayjs.locale('zh-cn')

const message = useMessage()
const tasks = ref<TaskProgressVO[]>([])
const loading = ref(false)
const autoRefresh = ref(true)
let timer: ReturnType<typeof setInterval> | null = null

const videoSteps = ['uploading', 'pending', 'transcoding', 'ai_analyzing', 'done']
const imageSteps = ['uploading', 'pending', 'processing', 'done']

function getSteps(task: TaskProgressVO) {
  const steps = task.type === 'video' ? videoSteps : imageSteps
  const currentIndex = steps.indexOf(task.status)
  return steps.map((_, i) => ({
    active: i === currentIndex,
    done: i < currentIndex
  }))
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    uploading: '上传中',
    pending: '等待处理',
    transcoding: '转码中',
    ai_analyzing: 'AI 分析中',
    processing: '处理中',
    done: '已完成',
    failed: '失败'
  }
  return map[status] ?? status
}

function statusTagType(status: string) {
  if (status === 'failed') return 'error'
  if (status === 'done') return 'success'
  if (status === 'pending') return 'default'
  return 'warning'
}

function typeTagType(type: string) {
  return type === 'video' ? 'info' : 'success'
}

function formatTime(iso: string) {
  return dayjs(iso).fromNow()
}

async function fetchTasks() {
  loading.value = true
  try {
    const res = await fetchProcessingTasks()
    tasks.value = Array.isArray(res) ? res : ((res as any).data ?? [])
  } catch {
    message.error('获取任务列表失败')
  } finally {
    loading.value = false
  }
}

function startPolling() {
  stopPolling()
  timer = setInterval(fetchTasks, 4000)
}

function stopPolling() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

watch(autoRefresh, (val) => {
  if (val) startPolling()
  else stopPolling()
})

onMounted(() => {
  fetchTasks()
  if (autoRefresh.value) startPolling()
})

onUnmounted(() => {
  stopPolling()
})
</script>

<style scoped>
.task-card {
  padding: 16px 20px;
  border-radius: 10px;
  background: #fafafa;
  border: 1px solid #f0f0f0;
  transition: all 0.2s ease;
}

.task-card:hover {
  background: #f5f5f5;
  border-color: #e0e0e0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.type-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
}

.type-icon.video {
  background: #e8f4fd;
}

.type-icon.image {
  background: #e8fde8;
}

.time-text {
  font-size: 12px;
  color: #aaa;
}

/* 步骤进度条 */
.step-bar {
  display: flex;
  gap: 3px;
  margin-top: 2px;
}

.step-segment {
  width: 18px;
  height: 4px;
  border-radius: 2px;
  background: #e5e5e5;
  transition: background 0.3s;
}

.step-segment.done {
  background: #36ad6a;
}

.step-segment.active {
  background: #f0a020;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

/* 状态圆点 */
.status-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  margin-right: 2px;
}

.status-dot.uploading,
.status-dot.transcoding,
.status-dot.ai_analyzing,
.status-dot.processing {
  background: #f0a020;
  animation: pulse 1.5s ease-in-out infinite;
}

.status-dot.pending {
  background: #aaa;
}

.status-dot.done {
  background: #36ad6a;
}

.status-dot.failed {
  background: #d03050;
}
</style>
