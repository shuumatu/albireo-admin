<template>
  <!-- 仅当状态非 done / 非空时渲染。done 状态由父组件保证不传入。 -->
  <div :class="['status-overlay', `status-${status}`]">
    <!-- 顶部 2px 进度条：有 progress 走确定值，否则走脉冲条带让用户知道"在动" -->
    <div v-if="hasProgressBar" class="progress-bar">
      <div
        v-if="hasProgress"
        class="progress-bar__fill"
        :style="{ width: progress + '%' }"
      />
      <div v-else class="progress-bar__indeterminate" />
    </div>

    <n-flex vertical align="center" justify="center" style="height: 100%;" :size="6">
      <n-spin v-if="isProcessing" size="medium" />
      <span class="status-text">
        {{ statusText }}<span v-if="hasProgress"> {{ progress }}%</span>
      </span>
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
  /** 0-100 整数。null/undefined 表示进度未知，UI 退回脉冲动画。 */
  progress?: number | null
}>()

defineEmits<{
  (e: 'retry'): void
}>()

const STATUS_LABELS: Record<string, string> = {
  uploading: '上传中',
  pending: '待处理',
  processing: '处理中',
  transcoding: '转码中',
  ai_analyzing: 'AI 分析中',
  failed: '上传失败',
  ai_analyze_failed: 'AI 分析失败',
  transcode_failed: '转码失败',
}

const statusText = computed(() => STATUS_LABELS[props.status] ?? props.status)

const isProcessing = computed(() =>
  ['uploading', 'processing', 'transcoding', 'ai_analyzing'].includes(props.status)
)

/**
 * 仅"非终态"画进度条；失败 / done 不画。
 * 终态的视觉抓手是边框红 + 重试按钮，不应叠加进度条。
 */
const hasProgressBar = computed(() => isProcessing.value)

const hasProgress = computed(
  () => typeof props.progress === 'number' && Number.isFinite(props.progress) && props.progress >= 0
)

const canRetry = computed(() =>
  props.status === 'failed' ||
  props.status === 'ai_analyze_failed' ||
  props.status === 'transcode_failed'
)
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

/* 进度条贴在封面顶部内侧，2px 不挤占信息区 */
.progress-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: rgba(255, 255, 255, 0.18);
  overflow: hidden;
}
.progress-bar__fill {
  height: 100%;
  background: rgba(255, 255, 255, 0.85);
  transition: width 0.4s ease;
}
.progress-bar__indeterminate {
  position: absolute;
  width: 35%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.85), transparent);
  animation: indeterminate 1.4s linear infinite;
}
@keyframes indeterminate {
  0% { left: -35%; }
  100% { left: 100%; }
}

/* 不同状态用不同色调，让"在哪一步"一眼可辨；具体渐变在 .status-overlay 上做。 */
.status-uploading      { --overlay-tone: #1668dc; }
.status-pending        { --overlay-tone: #595959; }
.status-processing     { --overlay-tone: #d46b08; }
.status-transcoding    { --overlay-tone: #722ed1; }
.status-ai_analyzing   { --overlay-tone: #1d7eb8; }
.status-failed         { --overlay-tone: #cf1322; }
.status-ai_analyze_failed { --overlay-tone: #cf1322; }
.status-transcode_failed  { --overlay-tone: #cf1322; }

.status-text {
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.2px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
}
</style>
