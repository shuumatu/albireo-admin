<template>
  <div class="upload-card" :class="cardStateClass">
    <!-- 缩略图 -->
    <div class="upload-card__thumb">
      <img
        v-if="thumbUrl && isImage"
        :src="thumbUrl"
        :alt="task.fileName"
        class="upload-card__thumb-media"
        loading="lazy"
      />
      <video
        v-else-if="thumbUrl && isVideo"
        :src="thumbUrl"
        class="upload-card__thumb-media"
        muted
        playsinline
        preload="metadata"
      />
      <div v-else class="upload-card__thumb-placeholder">
        <n-icon size="20" :depth="3"><DocumentIcon /></n-icon>
        <span>{{ ext }}</span>
      </div>
    </div>

    <!-- 主体 -->
    <div class="upload-card__body">
      <div class="upload-card__head">
        <n-tooltip placement="top">
          <template #trigger>
            <span class="upload-card__name">{{ task.fileName }}</span>
          </template>
          {{ task.fileName }}
        </n-tooltip>
        <n-tag size="small" :type="statusTagType" :bordered="false">
          {{ statusLabel }}
        </n-tag>
      </div>

      <div class="upload-card__progress">
        <n-progress
          v-if="task.status === 'hashing'"
          :percentage="task.hashProgress"
          :height="6"
          :border-radius="3"
          :show-indicator="false"
          :color="'#a0adb8'"
        />
        <n-progress
          v-else
          :percentage="task.progress"
          :height="6"
          :border-radius="3"
          :show-indicator="false"
          :status="progressStatus"
        />
      </div>

      <div class="upload-card__meta">
        <span class="upload-card__meta-item">
          {{ task.status === 'hashing' ? `计算指纹 ${task.hashProgress}%` : `${task.progress}%` }}
        </span>
        <span class="upload-card__meta-sep">·</span>
        <span class="upload-card__meta-item">
          {{ formatBytes(task.uploadedBytes) }} / {{ formatBytes(task.fileSize) }}
        </span>
        <template v-if="task.status === 'uploading'">
          <span class="upload-card__meta-sep">·</span>
          <span class="upload-card__meta-item">{{ formatSpeed(task.speed) }}</span>
          <span class="upload-card__meta-sep">·</span>
          <span class="upload-card__meta-item">剩余 {{ formatEta(task.eta) }}</span>
        </template>
        <template v-if="task.status === 'success' && task.objectKey">
          <span class="upload-card__meta-sep">·</span>
          <span class="upload-card__meta-item upload-card__meta-key">{{ task.objectKey }}</span>
        </template>
      </div>

      <div v-if="task.errorMessage" class="upload-card__error">
        {{ task.errorMessage }}
      </div>

      <div v-if="task.isStale" class="upload-card__stale">
        <n-icon><InformationCircleIcon /></n-icon>
        <span>页面刷新后该任务的文件已丢失，请重新选择同名同大小的文件以继续</span>
        <n-button size="tiny" type="primary" @click="onPickResume">重新选择</n-button>
        <input
          ref="resumeInputRef"
          type="file"
          class="upload-card__resume-input"
          @change="onResumeFile"
        />
      </div>
    </div>

    <!-- 操作 -->
    <div class="upload-card__actions">
      <n-tooltip v-if="canPause">
        <template #trigger>
          <n-button size="small" circle quaternary aria-label="暂停" @click="$emit('pause', task.id)">
            <template #icon>
              <n-icon><PauseIcon /></n-icon>
            </template>
          </n-button>
        </template>
        暂停
      </n-tooltip>
      <n-tooltip v-if="canResume">
        <template #trigger>
          <n-button
            size="small"
            type="primary"
            circle
            aria-label="继续"
            @click="$emit('resume', task.id)"
          >
            <template #icon>
              <n-icon><PlayIcon /></n-icon>
            </template>
          </n-button>
        </template>
        继续
      </n-tooltip>
      <n-tooltip v-if="canRetry">
        <template #trigger>
          <n-button
            size="small"
            type="warning"
            circle
            aria-label="重试"
            @click="$emit('retry', task.id)"
          >
            <template #icon>
              <n-icon><RefreshIcon /></n-icon>
            </template>
          </n-button>
        </template>
        重试
      </n-tooltip>
      <n-tooltip v-if="task.status === 'success' && task.objectKey">
        <template #trigger>
          <n-button
            size="small"
            quaternary
            circle
            aria-label="复制对象 key"
            @click="copyKey"
          >
            <template #icon>
              <n-icon><CopyIcon /></n-icon>
            </template>
          </n-button>
        </template>
        复制对象 Key
      </n-tooltip>
      <n-tooltip v-if="canRemove">
        <template #trigger>
          <n-button
            size="small"
            quaternary
            circle
            aria-label="移除"
            @click="$emit('remove', task.id)"
          >
            <template #icon>
              <n-icon><CloseIcon /></n-icon>
            </template>
          </n-button>
        </template>
        移除
      </n-tooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onBeforeUnmount, watch } from 'vue'
import { useMessage } from 'naive-ui'
import {
  PauseCircleOutline as PauseIcon,
  PlayCircleOutline as PlayIcon,
  RefreshOutline as RefreshIcon,
  CloseCircleOutline as CloseIcon,
  CopyOutline as CopyIcon,
  DocumentOutline as DocumentIcon,
  InformationCircleOutline as InformationCircleIcon,
} from '@vicons/ionicons5'
import type { UploadTask } from '../../stores/uploadStore'
import { formatBytes, formatSpeed, formatEta, fileExtension } from './composables/formatters'

const props = defineProps<{
  task: UploadTask
  /** 单文件文件对象（用于生成本地缩略图） */
  file?: File | null
}>()

const emit = defineEmits<{
  (e: 'pause', id: string): void
  (e: 'resume', id: string): void
  (e: 'retry', id: string): void
  (e: 'remove', id: string): void
  (e: 'attach', payload: { id: string; file: File }): void
}>()

const message = useMessage()

const ext = computed(() => fileExtension(props.task.fileName))
const isImage = computed(() => props.task.fileType.startsWith('image/'))
const isVideo = computed(() => props.task.fileType.startsWith('video/'))

const thumbUrl = ref<string | null>(null)
function buildThumb() {
  if (thumbUrl.value) {
    URL.revokeObjectURL(thumbUrl.value)
    thumbUrl.value = null
  }
  if (props.file && (isImage.value || isVideo.value)) {
    thumbUrl.value = URL.createObjectURL(props.file)
  }
}
watch(() => props.file, buildThumb, { immediate: true })
onBeforeUnmount(() => {
  if (thumbUrl.value) URL.revokeObjectURL(thumbUrl.value)
})

const statusLabel = computed(() => {
  switch (props.task.status) {
    case 'queued': return '排队中'
    case 'hashing': return '计算指纹'
    case 'preparing': return '准备中'
    case 'uploading': return '上传中'
    case 'pausing': return '暂停中'
    case 'paused': return '已暂停'
    case 'success': return '已完成'
    case 'error': return '失败'
    case 'need-resume': return '待恢复'
    default: return ''
  }
})
const statusTagType = computed(() => {
  switch (props.task.status) {
    case 'uploading':
    case 'preparing':
    case 'hashing':
    case 'queued': return 'info'
    case 'pausing':
    case 'paused':
    case 'need-resume': return 'warning'
    case 'success': return 'success'
    case 'error': return 'error'
    default: return 'default'
  }
})
const progressStatus = computed(() => {
  if (props.task.status === 'error') return 'error'
  if (props.task.status === 'success') return 'success'
  if (props.task.status === 'paused') return 'warning'
  return 'default'
})

const cardStateClass = computed(() => ({
  'upload-card--success': props.task.status === 'success',
  'upload-card--error': props.task.status === 'error',
  'upload-card--paused': props.task.status === 'paused' || props.task.status === 'pausing',
  'upload-card--stale': props.task.status === 'need-resume',
}))

const canPause = computed(() =>
  ['uploading', 'hashing', 'preparing', 'queued'].includes(props.task.status),
)
const canResume = computed(() => props.task.status === 'paused')
const canRetry = computed(() =>
  props.task.status === 'error' && !props.task.isStale,
)
const canRemove = computed(() =>
  ['success', 'error', 'paused', 'need-resume'].includes(props.task.status),
)

async function copyKey() {
  if (!props.task.objectKey) return
  try {
    await navigator.clipboard.writeText(props.task.objectKey)
    message.success('已复制对象 Key')
  } catch {
    message.error('复制失败，请手动复制')
  }
}

const resumeInputRef = ref<HTMLInputElement | null>(null)
function onPickResume() {
  resumeInputRef.value?.click()
}
function onResumeFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) emit('attach', { id: props.task.id, file })
  input.value = ''
}
</script>

<style scoped>
.upload-card {
  display: flex;
  align-items: stretch;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--n-border-color);
  border-radius: 10px;
  background: var(--n-color);
  transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
}
.upload-card:hover {
  border-color: var(--n-color-target, #2080f0);
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.06);
}
.upload-card--success { border-color: rgba(24, 160, 88, 0.45); }
.upload-card--error   { border-color: rgba(208, 54, 72, 0.5); }
.upload-card--paused  { border-color: rgba(240, 160, 32, 0.45); }
.upload-card--stale   { border-color: rgba(240, 160, 32, 0.6); background: rgba(240, 160, 32, 0.04); }

.upload-card__thumb {
  width: 64px;
  height: 64px;
  border-radius: 8px;
  background: var(--n-color-modal, rgba(127,127,127,0.06));
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.upload-card__thumb-media {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.upload-card__thumb-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  color: var(--n-text-color-3);
  font-size: 11px;
  font-weight: 500;
}

.upload-card__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.upload-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}
.upload-card__name {
  font-size: 13px;
  font-weight: 500;
  color: var(--n-text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}
.upload-card__progress { padding: 2px 0; }
.upload-card__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--n-text-color-3);
  flex-wrap: wrap;
}
.upload-card__meta-key {
  font-family: var(--n-font-family-mono, ui-monospace, monospace);
  background: var(--n-color-modal, rgba(127,127,127,0.06));
  padding: 1px 6px;
  border-radius: 4px;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.upload-card__error {
  font-size: 12px;
  color: var(--n-error-color, #d03648);
  background: rgba(208, 54, 72, 0.08);
  padding: 4px 8px;
  border-radius: 4px;
}
.upload-card__stale {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--n-text-color-2);
  background: rgba(240, 160, 32, 0.08);
  padding: 4px 8px;
  border-radius: 4px;
  flex-wrap: wrap;
}
.upload-card__resume-input {
  display: none;
}
.upload-card__actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

@media (max-width: 768px) {
  .upload-card {
    flex-wrap: wrap;
  }
  .upload-card__actions {
    width: 100%;
    justify-content: flex-end;
  }
  .upload-card__meta-key {
    max-width: 160px;
  }
}
</style>
