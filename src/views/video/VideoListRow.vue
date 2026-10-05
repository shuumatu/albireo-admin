<template>
  <div
    tabindex="0"
    role="group"
    :aria-label="`${title}，按 Enter 编辑，按空格${selected ? '取消选择' : '选择'}`"
    @keydown.enter.self.prevent="$emit('menu', video, 'edit')"
    @keydown.space.self.prevent="$emit('check', video, !selected)"
    :class="[
      'video-row',
      { 'video-row--selected': selected, 'video-row--needs-attention': attention },
    ]"
    @click="onRowClick"
    @dblclick="onRowDblClick"
  >
    <!-- 左侧 checkbox：始终可见，列表场景下不绕弯子 -->
    <div class="row-check" @click.stop>
      <n-checkbox :checked="selected" @update:checked="$emit('check', video, $event)" />
    </div>

    <!-- 缩略图 + 时长 / 分辨率徽标 -->
    <div class="row-thumb">
      <MediaImage :renditions="video?.renditions"
        v-if="video.coverUrl && !coverFailed"
        :src="video.coverUrl"
        :alt="title"
        loading="lazy"
        @error="coverFailed = true"
      />
      <div v-else class="thumb-placeholder">{{ extension }}</div>
      <div v-if="duration" class="thumb-duration">{{ duration }}</div>
      <VideoStatusOverlay
        v-if="overlayStatus"
        :status="overlayStatus"
        :progress="progress ?? null"
        @retry="$emit('retry', video)"
      />
    </div>

    <!-- 中间信息块 -->
    <div class="row-info">
      <div class="row-info__title-line">
        <span class="row-info__title" :title="title">{{ title }}</span>
        <span v-if="attention" class="attention-pill">需处理</span>
      </div>
      <div class="row-info__meta">
        <span v-if="resolution" class="meta-piece">{{ resolution }}</span>
        <span v-if="resolution && fileSize" class="meta-sep">·</span>
        <span v-if="fileSize" class="meta-piece">{{ fileSize }}</span>
        <span v-if="(resolution || fileSize) && firstCollectionName" class="meta-sep">·</span>
        <span v-if="firstCollectionName" class="meta-piece" :title="firstCollectionName">合集：{{ firstCollectionName }}</span>
        <span
          v-if="hasLocation === false"
          class="meta-sep"
          :class="{ 'meta-sep--invisible': !(resolution || fileSize || firstCollectionName) }"
        >·</span>
        <span
          v-if="hasLocation === false"
          class="meta-piece meta-piece--missing"
          title="未定位（GPS / 手填均未补全）"
        >
          <svg viewBox="0 0 24 24" width="12" height="12" style="vertical-align: -2px; margin-right: 2px;">
            <path
              d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
            />
          </svg>
          未定位
        </span>
        <span
          v-if="hasLocation === true"
          class="meta-pin"
          title="已定位"
        >
          <svg viewBox="0 0 24 24" width="12" height="12">
            <path
              d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"
              fill="currentColor"
            />
          </svg>
        </span>
      </div>
      <div v-if="video.description" class="row-info__desc" :title="video.description">{{ video.description }}</div>
    </div>

    <!-- 右侧状态 / 时间 / 菜单 -->
    <div class="row-aside" @click.stop>
      <n-tag
        v-if="visibilityTxt"
        size="small"
        :type="visibilityType"
        :bordered="false"
      >
        {{ visibilityTxt }}
      </n-tag>
      <span class="row-aside__time" :title="video.createdAt">{{ relTime }}</span>
      <n-dropdown
        :options="menuOptions"
        trigger="click"
        placement="bottom-end"
        @select="(action: string) => $emit('menu', video, action)"
      >
        <n-button quaternary circle size="small">
          <svg viewBox="0 0 24 24" width="16" height="16">
            <circle cx="12" cy="5" r="2" fill="currentColor" />
            <circle cx="12" cy="12" r="2" fill="currentColor" />
            <circle cx="12" cy="19" r="2" fill="currentColor" />
          </svg>
        </n-button>
      </n-dropdown>
    </div>
  </div>
</template>

<script setup lang="ts">
import MediaImage from '../../components/MediaImage.vue'

import { computed, h, ref, watch } from 'vue'
import { NCheckbox, NButton, NDropdown, NTag } from 'naive-ui'
import VideoStatusOverlay from './VideoStatusOverlay.vue'
import {
  formatDuration,
  resolutionLabel,
  formatBytes,
  formatRelative,
  fileExtensionUpper,
  visibilityText,
  visibilityTagType,
  needsAttention,
} from './composables/videoFormat'
import type { VideoItem } from '../../api/manager'

const props = defineProps<{
  video: VideoItem
  selected: boolean
  hasSelection: boolean
  progress?: number | null
}>()

const emit = defineEmits<{
  (e: 'click', video: VideoItem, ev: MouseEvent): void
  (e: 'dblclick', video: VideoItem): void
  (e: 'check', video: VideoItem, checked: boolean): void
  (e: 'menu', video: VideoItem, action: string): void
  (e: 'retry', video: VideoItem): void
}>()

const coverFailed = ref(false)
watch(() => props.video.coverUrl, () => { coverFailed.value = false })

const title = computed(() => props.video.title || props.video.fileName || '未命名视频')
const extension = computed(() => fileExtensionUpper(props.video.fileName))
const duration = computed(() => formatDuration(props.video.durationMs))
const resolution = computed(() => resolutionLabel(props.video.width, props.video.height))
const fileSize = computed(() => formatBytes(props.video.fileSize))
const relTime = computed(() => formatRelative(props.video.createdAt))
const visibilityTxt = computed(() => visibilityText(props.video.visibility))
const visibilityType = computed(() => visibilityTagType(props.video.visibility))
const attention = computed(() => needsAttention(props.video.status))
const firstCollectionName = computed(() => props.video.collections?.[0]?.name ?? '')

const hasLocation = computed<boolean | null>(() => {
  const v = props.video.hasLocation
  if (v === true) return true
  if (v === false) return false
  return null
})

const overlayStatus = computed(() => {
  const s = props.video.status
  if (!s || s === 'done') return ''
  return s
})

const menuOptions = computed(() => {
  const opts: any[] = [
    { label: '编辑', key: 'edit' },
    { label: '在新标签页打开', key: 'open-public' },
    { label: '视频截帧', key: 'set-cover' },
    { label: '复制对象 Key', key: 'copy-key' },
  ]
  // 仅 done 视频可分享，与 VideoCard / ImageListRow 一致
  if (!overlayStatus.value) {
    opts.push({ label: '分享', key: 'share' })
  }
  opts.push({ type: 'divider', key: 'd1' })
  opts.push({
    label: () => h('span', { style: { color: 'var(--n-error-color, #d03050)' } }, '删除'),
    key: 'delete',
  })
  return opts
})

function onRowClick(ev: MouseEvent) {
  emit('click', props.video, ev)
}

function onRowDblClick() {
  // 父级在 dblclick 到达时取消同时到达的 click 触发的 openDrawer，跳到公共站详情页
  emit('dblclick', props.video)
}
</script>

<style scoped>
.video-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}
/* hover 用极淡的中性灰，浅色主题加深 / 深色主题提亮都自然 */
.video-row:hover {
  background: rgba(0, 0, 0, 0.04);
}
/* 选中：用 primary 半透明背景 + 边框做强信号，浅色主题上仍清晰可辨 */
.video-row--selected {
  background: color-mix(in srgb, var(--n-primary-color) 10%, transparent);
  border-color: color-mix(in srgb, var(--n-primary-color) 45%, transparent);
}
.video-row--selected:hover {
  background: color-mix(in srgb, var(--n-primary-color) 14%, transparent);
}
.video-row--needs-attention {
  border-color: color-mix(in srgb, var(--n-error-color) 50%, transparent);
  background: color-mix(in srgb, var(--n-error-color) 4%, transparent);
}

.row-check {
  flex: 0 0 auto;
}

.row-thumb {
  position: relative;
  flex: 0 0 auto;
  width: 120px;
  height: 68px;
  border-radius: 6px;
  overflow: hidden;
  /* 缩略图永远黑底（视频天然黑底好看） */
  background: #0e0e12;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.08);
}
.row-thumb :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.thumb-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.6);
  font-size: 11px;
  font-weight: 600;
}
.thumb-duration {
  position: absolute;
  right: 4px;
  bottom: 4px;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 2px;
}

.row-info {
  flex: 1 1 auto;
  min-width: 0;
}
.row-info__title-line {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.row-info__title {
  font-size: 14px;
  font-weight: 500;
  color: var(--n-text-color-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.attention-pill {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 8px;
  background: var(--n-error-color);
  color: #fff;
  flex: 0 0 auto;
}
.row-info__meta {
  margin-top: 3px;
  font-size: 12px;
  color: var(--n-text-color-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-variant-numeric: tabular-nums;
}
.meta-sep {
  margin: 0 6px;
  opacity: 0.5;
}
.meta-sep--invisible {
  visibility: hidden;
  margin: 0;
  width: 0;
}
.meta-piece--missing {
  color: var(--n-warning-color, #d4a017);
  font-weight: 500;
  display: inline-flex;
  align-items: center;
}
.meta-pin {
  margin-left: 6px;
  display: inline-flex;
  align-items: center;
  color: var(--n-success-color, #18a058);
  vertical-align: middle;
}
.row-info__desc {
  margin-top: 3px;
  font-size: 12px;
  color: var(--n-text-color-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-aside {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
}
.row-aside__time {
  font-size: 12px;
  color: var(--n-text-color-3);
  min-width: 70px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.video-row:focus-visible { outline: 3px solid var(--n-primary-color, var(--admin-accent, #2f7b5b)); outline-offset: 3px; }
@media (hover: none) { .select-box { opacity: 1; pointer-events: auto; } }
@media (prefers-reduced-motion: reduce) { .video-row, :deep(.cover-img) { transition: none; } }
</style>
