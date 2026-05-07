<template>
  <!-- 仅当 status 非 done / 非空时渲染。done 状态由父组件保证不传入。 -->
  <div :class="['status-overlay', `status-${status}`]">
    <n-flex vertical align="center" justify="center" style="height: 100%;" :size="6">
      <n-spin v-if="isProcessing" size="medium" />
      <span class="status-text">{{ statusText }}</span>
      <n-button
        v-if="canRetry"
        size="small"
        type="error"
        @click.stop="$emit('retry')"
      >
        重试
      </n-button>
    </n-flex>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { NFlex, NSpin, NButton } from 'naive-ui'

const props = defineProps<{
  status: string
}>()

defineEmits<{
  (e: 'retry'): void
}>()

const STATUS_LABELS: Record<string, string> = {
  uploading: '上传中',
  pending: '待处理',
  processing: '处理中',
  failed: '上传失败',
  process_failed: '处理失败',
}

const statusText = computed(() => STATUS_LABELS[props.status] ?? props.status)

const isProcessing = computed(() =>
  ['uploading', 'processing', 'pending'].includes(props.status)
)

const canRetry = computed(() => props.status === 'failed' || props.status === 'process_failed')
</script>

<style scoped>
.status-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 5;
  pointer-events: auto;
  /*
    所有状态共用同一渐变模板，色调由各状态类的 --overlay-tone 决定。
    顶部 88% 不透明、底部 65%，避免大块平涂在浅色页面里太重，
    spinner 与文字落在更深的上半区，浅底卡片切换时不刺眼。
  */
  background-image: linear-gradient(
    180deg,
    color-mix(in srgb, var(--overlay-tone, #000) 88%, transparent) 0%,
    color-mix(in srgb, var(--overlay-tone, #000) 65%, transparent) 100%
  );
}

.status-uploading      { --overlay-tone: #1668dc; }
.status-pending        { --overlay-tone: #595959; }
.status-processing     { --overlay-tone: #d46b08; }
.status-failed         { --overlay-tone: #cf1322; }
.status-process_failed { --overlay-tone: #cf1322; }

.status-text {
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.2px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
}
</style>
