<template>
  <div class="upload-toolbar">
    <n-flex align="center" :wrap="true" size="small" class="upload-toolbar__left">
      <n-radio-group v-model:value="filterValue" size="small">
        <n-radio-button value="all">全部 ({{ stats.total }})</n-radio-button>
        <n-radio-button value="active">进行中 ({{ stats.uploading + stats.queued }})</n-radio-button>
        <n-radio-button value="paused">已暂停 ({{ stats.paused }})</n-radio-button>
        <n-radio-button value="failed">失败 ({{ stats.failed }})</n-radio-button>
        <n-radio-button value="completed">已完成 ({{ stats.completed }})</n-radio-button>
      </n-radio-group>
      <n-divider vertical />
      <n-select
        v-model:value="sortKey"
        size="small"
        :options="sortOptions"
        style="width: 130px"
      />
      <n-button
        size="small"
        quaternary
        :title="sortAsc ? '升序' : '降序'"
        @click="sortAsc = !sortAsc"
      >
        <template #icon>
          <n-icon>
            <component :is="sortAsc ? ArrowUpIcon : ArrowDownIcon" />
          </n-icon>
        </template>
      </n-button>
    </n-flex>

    <n-flex align="center" size="small" class="upload-toolbar__right" :wrap="true">
      <n-button size="small" :disabled="!canPauseAny" @click="$emit('pauseAll')">
        <template #icon>
          <n-icon><PauseIcon /></n-icon>
        </template>
        全部暂停
      </n-button>
      <n-button
        size="small"
        type="primary"
        :disabled="!canResumeAny"
        @click="$emit('resumeAll')"
      >
        <template #icon>
          <n-icon><PlayIcon /></n-icon>
        </template>
        全部继续
      </n-button>
      <n-button
        size="small"
        type="warning"
        :disabled="stats.failed === 0"
        @click="$emit('retryFailed')"
      >
        <template #icon>
          <n-icon><RefreshIcon /></n-icon>
        </template>
        重试失败
      </n-button>
      <n-button
        size="small"
        :disabled="stats.completed === 0"
        @click="$emit('clearCompleted')"
      >
        <template #icon>
          <n-icon><TrashIcon /></n-icon>
        </template>
        清空已完成
      </n-button>
    </n-flex>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  PauseCircleOutline as PauseIcon,
  PlayCircleOutline as PlayIcon,
  RefreshOutline as RefreshIcon,
  TrashOutline as TrashIcon,
  ArrowUp as ArrowUpIcon,
  ArrowDown as ArrowDownIcon,
} from '@vicons/ionicons5'
import { useUploadStore } from '../../stores/uploadStore'

defineEmits<{
  (e: 'pauseAll'): void
  (e: 'resumeAll'): void
  (e: 'retryFailed'): void
  (e: 'clearCompleted'): void
}>()

const store = useUploadStore()

const stats = computed(() => store.stats)

const filterValue = computed({
  get: () => store.filter,
  set: (v) => (store.filter = v),
})
const sortKey = computed({
  get: () => store.sortKey,
  set: (v) => (store.sortKey = v),
})
const sortAsc = computed({
  get: () => store.sortAsc,
  set: (v) => (store.sortAsc = v),
})

const sortOptions = [
  { label: '加入时间', value: 'createdAt' },
  { label: '文件大小', value: 'size' },
  { label: '上传进度', value: 'progress' },
]

const canPauseAny = computed(
  () => stats.value.uploading > 0 || stats.value.queued > 0,
)
const canResumeAny = computed(() => stats.value.paused > 0)
</script>

<style scoped>
.upload-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 4px 0;
}
.upload-toolbar__left,
.upload-toolbar__right {
  flex-wrap: wrap;
}
@media (max-width: 768px) {
  .upload-toolbar {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
