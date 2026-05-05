<template>
  <n-flex align="center" :size="4" :wrap="false">
    <n-spin v-if="config.showSpin" size="small" />
    <n-tag :type="config.type" size="small" :bordered="false">
      {{ config.text }}
    </n-tag>
  </n-flex>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { NFlex, NSpin, NTag } from 'naive-ui'

type TagType = 'default' | 'primary' | 'info' | 'success' | 'warning' | 'error'

export type MediaStatus =
  | 'uploading'
  | 'pending'
  | 'processing'
  | 'transcoding'
  | 'ai_analyzing'
  | 'done'
  | 'failed'
  | string
  | null
  | undefined

const props = withDefaults(
  defineProps<{
    status?: MediaStatus
    /**
     * status 为 falsy 或 'done' 时的展示文本，默认 "完成"。
     * 列表 / 网格视图都用同一份配置，避免两边漂移。
     */
    doneText?: string
  }>(),
  { doneText: '完成' }
)

interface StatusConfig {
  type: TagType
  text: string
  showSpin: boolean
}

const STATUS_MAP: Record<string, StatusConfig> = {
  uploading: { type: 'info', text: '上传中', showSpin: true },
  pending: { type: 'default', text: '待处理', showSpin: false },
  processing: { type: 'warning', text: '处理中', showSpin: true },
  transcoding: { type: 'warning', text: '转码中', showSpin: true },
  ai_analyzing: { type: 'info', text: 'AI 分析中', showSpin: true },
  failed: { type: 'error', text: '失败', showSpin: false },
}

const config = computed<StatusConfig>(() => {
  const s = props.status
  if (!s || s === 'done') {
    return { type: 'success', text: props.doneText, showSpin: false }
  }
  return STATUS_MAP[s] ?? { type: 'default', text: String(s), showSpin: false }
})
</script>
