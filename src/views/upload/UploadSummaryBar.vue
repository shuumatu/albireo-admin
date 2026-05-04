<template>
  <n-card class="upload-summary" size="small" :bordered="true">
    <div class="upload-summary__grid">
      <div class="upload-summary__cell">
        <span class="upload-summary__label">全部</span>
        <span class="upload-summary__value">{{ stats.total }}</span>
      </div>
      <div class="upload-summary__cell upload-summary__cell--info">
        <span class="upload-summary__label">上传中</span>
        <span class="upload-summary__value">{{ stats.uploading }}</span>
      </div>
      <div class="upload-summary__cell upload-summary__cell--warning">
        <span class="upload-summary__label">已暂停</span>
        <span class="upload-summary__value">{{ stats.paused }}</span>
      </div>
      <div class="upload-summary__cell upload-summary__cell--success">
        <span class="upload-summary__label">已完成</span>
        <span class="upload-summary__value">{{ stats.completed }}</span>
      </div>
      <div class="upload-summary__cell upload-summary__cell--error">
        <span class="upload-summary__label">失败</span>
        <span class="upload-summary__value">{{ stats.failed }}</span>
      </div>
    </div>

    <div class="upload-summary__progress">
      <div class="upload-summary__progress-meta">
        <span>总体进度 {{ stats.overallPercent }}%</span>
        <span class="upload-summary__progress-detail">
          {{ formatBytes(stats.uploadedBytes) }} / {{ formatBytes(stats.totalBytes) }}
          <template v-if="stats.aggregateSpeed > 0">
            · {{ formatSpeed(stats.aggregateSpeed) }} · 剩余 {{ formatEta(stats.eta) }}
          </template>
        </span>
      </div>
      <n-progress
        :percentage="stats.overallPercent"
        :height="8"
        :border-radius="4"
        :show-indicator="false"
        :status="stats.failed > 0 && stats.uploading === 0 ? 'error' : 'default'"
      />
    </div>

    <div class="upload-summary__concurrency">
      <span class="upload-summary__concurrency-label">全局并发</span>
      <n-slider
        v-model:value="concurrency"
        :min="1"
        :max="8"
        :marks="{ 1: '1', 4: '4', 8: '8' }"
        :step="1"
        style="flex: 1; max-width: 240px"
      />
      <n-tag size="small" :bordered="false">{{ concurrency }} 槽</n-tag>
    </div>
  </n-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useUploadStore } from '../../stores/uploadStore'
import { formatBytes, formatSpeed, formatEta } from './composables/formatters'

const store = useUploadStore()

const stats = computed(() => store.stats)
const concurrency = computed({
  get: () => store.concurrency,
  set: (v) => (store.concurrency = v),
})
</script>

<style scoped>
.upload-summary {
  background: var(--n-color);
}
.upload-summary__grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
}
.upload-summary__cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--n-color-modal, rgba(127, 127, 127, 0.06));
  border: 1px solid var(--n-border-color);
}
.upload-summary__cell--info { border-color: var(--n-color-target, #1890ff44); }
.upload-summary__cell--warning { border-color: #f0a02044; }
.upload-summary__cell--success { border-color: #18a05844; }
.upload-summary__cell--error { border-color: #d0364844; }
.upload-summary__label {
  font-size: 12px;
  color: var(--n-text-color-3);
}
.upload-summary__value {
  font-size: 22px;
  font-weight: 600;
  color: var(--n-text-color);
  line-height: 1.2;
  margin-top: 2px;
}
.upload-summary__progress {
  margin-top: 14px;
}
.upload-summary__progress-meta {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 6px;
  font-size: 13px;
  color: var(--n-text-color-2);
}
.upload-summary__progress-detail {
  font-size: 12px;
  color: var(--n-text-color-3);
}
.upload-summary__concurrency {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  color: var(--n-text-color-2);
}
.upload-summary__concurrency-label {
  flex-shrink: 0;
}

@media (max-width: 768px) {
  .upload-summary__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .upload-summary__concurrency {
    flex-wrap: wrap;
  }
}
</style>
