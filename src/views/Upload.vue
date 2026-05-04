<template>
  <div class="upload-page">
    <UploadPageHeader />

    <UploadDropzone
      class="upload-page__dropzone"
      accept="image/*,video/*"
      @files="onPickFiles"
    />

    <UploadSummaryBar v-if="store.tasks.length > 0" class="upload-page__summary" />

    <UploadBatchToolbar
      v-if="store.tasks.length > 0"
      class="upload-page__toolbar"
      @pause-all="queue.pauseAll"
      @resume-all="queue.resumeAll"
      @retry-failed="queue.retryAllFailed"
      @clear-completed="store.clearCompleted"
    />

    <transition-group
      v-if="visibleTasks.length > 0"
      tag="div"
      name="upload-task-list"
      class="upload-page__list"
    >
      <UploadTaskCard
        v-for="task in visibleTasks"
        :key="task.id"
        :task="task"
        :file="fileFor(task.id)"
        @pause="queue.pauseTask"
        @resume="queue.resumeTask"
        @retry="queue.retryTask"
        @remove="queue.removeTask"
        @attach="onAttachResumeFile"
      />
    </transition-group>

    <n-empty
      v-else-if="store.tasks.length > 0"
      description="当前筛选下没有任务"
      class="upload-page__empty"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useDialog, useMessage } from 'naive-ui'
import { onBeforeRouteLeave } from 'vue-router'
import UploadPageHeader from './upload/UploadPageHeader.vue'
import UploadSummaryBar from './upload/UploadSummaryBar.vue'
import UploadDropzone from './upload/UploadDropzone.vue'
import UploadBatchToolbar from './upload/UploadBatchToolbar.vue'
import UploadTaskCard from './upload/UploadTaskCard.vue'
import { useUploadQueue } from './upload/composables/useUploadQueue'
import { useUploadStore } from '../stores/uploadStore'
import { formatBytes } from './upload/composables/formatters'

const store = useUploadStore()
const queue = useUploadQueue()
const dialog = useDialog()
const message = useMessage()

/** 文件预览/缩略图引用，按 task id 维护，仅在新加入文件时填入 */
const fileMap = ref(new Map<string, File>())

function fileFor(id: string): File | undefined {
  return fileMap.value.get(id)
}

const visibleTasks = computed(() => store.visibleTasks)

const ACCEPT_PREFIXES = ['image/', 'video/']
const SOFT_MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024 // 5GB

async function onPickFiles(files: File[]) {
  if (!files.length) return
  // 过滤 + 提示
  const oversize = files.filter((f) => f.size > SOFT_MAX_FILE_SIZE)
  if (oversize.length) {
    const ok = await new Promise<boolean>((resolve) => {
      dialog.warning({
        title: '部分文件超过建议大小',
        content: `检测到 ${oversize.length} 个文件大于 ${formatBytes(SOFT_MAX_FILE_SIZE)}，可能耗时较长。是否继续？`,
        positiveText: '继续上传',
        negativeText: '取消',
        onPositiveClick: () => resolve(true),
        onNegativeClick: () => resolve(false),
        onClose: () => resolve(false),
      })
    })
    if (!ok) return
  }

  const nonAccept = files.filter(
    (f) => !ACCEPT_PREFIXES.some((p) => (f.type || '').startsWith(p)),
  )
  if (nonAccept.length) {
    message.warning(
      `已加入 ${nonAccept.length} 个非图片/视频文件，仍将上传`,
      { duration: 3000 },
    )
  }

  // 记录每个文件的 ID（按 name+size 匹配）
  const beforeIds = new Set(store.tasks.map((t) => t.id))
  await queue.enqueueFiles(files)
  for (const t of store.tasks) {
    if (beforeIds.has(t.id)) continue
    const matched = files.find(
      (f) => f.name === t.fileName && f.size === t.fileSize,
    )
    if (matched) fileMap.value.set(t.id, matched)
  }
}

function onAttachResumeFile(payload: { id: string; file: File }) {
  fileMap.value.set(payload.id, payload.file)
  void queue.tryAttachAndResume(payload.id, payload.file)
}

// ============== 路由离开拦截 ==============
onBeforeRouteLeave((_to, _from, next) => {
  if (!store.hasRunningTasks()) {
    next()
    return
  }
  dialog.warning({
    title: '当前还有上传任务进行中',
    content: '离开页面后任务会被暂停，回到该页可重新选择文件继续。是否离开？',
    positiveText: '离开',
    negativeText: '继续上传',
    onPositiveClick: () => next(),
    onNegativeClick: () => next(false),
    onClose: () => next(false),
  })
})

// ============== 键盘快捷键 ==============
function onKeyDown(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null
  if (
    target &&
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
  )
    return
  if (e.key === 'p' || e.key === 'P') {
    if (store.tasks.some((t) => ['uploading', 'hashing', 'preparing', 'queued'].includes(t.status))) {
      queue.pauseAll()
      message.info('已全部暂停')
    }
  } else if (e.key === 'r' || e.key === 'R') {
    if (store.stats.failed > 0) {
      queue.retryAllFailed()
      message.info('已重试所有失败任务')
    }
  }
}
onMounted(() => window.addEventListener('keydown', onKeyDown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeyDown))
</script>

<style scoped>
.upload-page {
  max-width: 980px;
  margin: 0 auto;
  padding: 24px 20px 60px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.upload-page__dropzone {
  margin-bottom: 4px;
}
.upload-page__summary,
.upload-page__toolbar {
  /* 让 summary/toolbar 之间有节奏 */
}
.upload-page__list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.upload-page__empty {
  margin: 24px auto;
}

.upload-task-list-enter-active,
.upload-task-list-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}
.upload-task-list-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.upload-task-list-leave-to {
  opacity: 0;
  transform: translateX(8px);
}
.upload-task-list-move {
  transition: transform 0.2s;
}

@media (max-width: 768px) {
  .upload-page {
    padding: 16px 12px 60px;
  }
}
</style>
