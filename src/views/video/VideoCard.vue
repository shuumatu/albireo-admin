<template>
  <div
    :class="[
      'video-card',
      { 'video-card--selected': selected, 'video-card--needs-attention': attention, 'video-card--has-selection-mode': hasSelection },
    ]"
    @click="onCardClick"
    @dblclick="onCardDblClick"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
  >
    <!-- 16:9 封面区，整张图作背景 -->
    <div class="cover-wrapper" ref="coverWrapper">
      <img
        v-if="video.coverUrl"
        :src="video.coverUrl"
        :alt="title"
        class="cover-img"
        loading="lazy"
        @error="coverFailed = true"
      />
      <div v-else class="cover-placeholder">
        <span class="cover-placeholder__ext">{{ extension }}</span>
        <span class="cover-placeholder__name">{{ video.fileName }}</span>
      </div>

      <!-- 左上：分辨率徽标 + 选中复选框（hover 或已有选中时显形） -->
      <div class="badge-top-left">
        <div
          class="select-box"
          :class="{ 'select-box--visible': showCheckbox }"
          @click.stop="onCheckboxClick($event)"
        >
          <n-checkbox :checked="selected" :focusable="false" />
        </div>
        <div v-if="resolution" class="badge badge--resolution">
          {{ resolution }}
        </div>
      </div>

      <!-- 右上：位置图钉 + 时长徽标 + 失败红点 -->
      <div class="badge-top-right">
        <!--
          位置 badge：与 ImageCard 同形态。已定位用主色 pin，未定位用灰色 outline pin，
          老接口未返回 hasLocation 时不显示。
        -->
        <div
          v-if="hasLocation === true"
          class="loc-badge loc-badge--has"
          title="已定位"
        >
          <svg viewBox="0 0 24 24" width="12" height="12">
            <path
              d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"
              fill="currentColor"
            />
          </svg>
        </div>
        <div
          v-else-if="hasLocation === false"
          class="loc-badge loc-badge--missing"
          title="未定位（GPS / 手填均未补全）"
        >
          <svg viewBox="0 0 24 24" width="12" height="12">
            <path
              d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
            />
          </svg>
        </div>
        <div v-if="attention" class="attention-dot" title="处理失败，需要您处理" />
        <div v-if="duration" class="badge badge--duration">{{ duration }}</div>
      </div>

      <!-- 处理中状态遮罩（含顶部进度条 / 状态文本 / 重试按钮） -->
      <VideoStatusOverlay
        v-if="overlayStatus"
        :status="overlayStatus"
        :progress="progress ?? null"
        @retry="$emit('retry', video)"
      />

      <!-- 底部渐变 + 标题信息条 -->
      <div class="info-strip">
        <div class="info-strip__title" :title="title">{{ title }}</div>
        <div class="info-strip__meta">
          <n-tag
            v-if="visibilityTxt"
            size="small"
            :type="visibilityType"
            :bordered="false"
            class="meta-tag"
          >
            {{ visibilityTxt }}
          </n-tag>
          <span class="info-strip__time" :title="video.createdAt">{{ relTime }}</span>
          <span v-if="firstCollectionName" class="info-strip__collection" :title="firstCollectionName">
            · {{ firstCollectionName }}
          </span>
        </div>
      </div>

      <!-- 右下：⋮ 操作菜单 -->
      <n-dropdown
        :options="menuOptions"
        trigger="click"
        placement="bottom-end"
        @select="onMenuSelect"
      >
        <button class="more-btn" @click.stop>
          <svg viewBox="0 0 24 24" width="18" height="18">
            <circle cx="12" cy="5" r="2" fill="currentColor" />
            <circle cx="12" cy="12" r="2" fill="currentColor" />
            <circle cx="12" cy="19" r="2" fill="currentColor" />
          </svg>
        </button>
      </n-dropdown>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, h } from 'vue'
import { NCheckbox, NDropdown, NTag } from 'naive-ui'
import VideoStatusOverlay from './VideoStatusOverlay.vue'
import {
  formatDuration,
  resolutionLabel,
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
  /** 是否已有任何选中（控制 checkbox 是否常驻可见） */
  hasSelection: boolean
  /** 转码进度（0-100），由父组件根据 task progress 注入 */
  progress?: number | null
}>()

const emit = defineEmits<{
  (e: 'click', video: VideoItem, ev: MouseEvent): void
  (e: 'dblclick', video: VideoItem): void
  (e: 'check', video: VideoItem, ev: MouseEvent): void
  (e: 'preview', video: VideoItem, anchor: HTMLElement): void
  (e: 'preview-close'): void
  (e: 'menu', video: VideoItem, action: string): void
  (e: 'retry', video: VideoItem): void
}>()

const coverWrapper = ref<HTMLElement | null>(null)
const coverFailed = ref(false)
const isHovering = ref(false)

const title = computed(() => props.video.title || props.video.fileName || '未命名视频')
const extension = computed(() => fileExtensionUpper(props.video.fileName))
const duration = computed(() => formatDuration(props.video.durationMs))
const resolution = computed(() => resolutionLabel(props.video.width, props.video.height))
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

/**
 * 决定是否覆盖一层状态遮罩：
 * - done / 空状态 → 不覆盖（最常见，用户不需要被打扰）
 * - 其它处理中 / 失败 → 覆盖
 * 失败也走遮罩，因为我们要在卡片中央显示重试按钮。
 */
const overlayStatus = computed(() => {
  const s = props.video.status
  if (!s || s === 'done') return ''
  return s
})

/** checkbox 的可见性：选中、已经在选中模式、或鼠标悬停在卡片上 */
const showCheckbox = computed(() => props.selected || props.hasSelection || isHovering.value)

const menuOptions = computed(() => {
  const opts: any[] = [
    { label: '编辑', key: 'edit' },
    { label: '在新标签页打开', key: 'open-public' },
  ]
  if (!overlayStatus.value) {
    opts.push({ label: '设置封面帧', key: 'set-cover' })
    // 仅 done 视频可分享：处理中 / 转码失败的视频对外不可播放
    opts.push({ label: '分享', key: 'share' })
  }
  opts.push({ label: '复制对象 Key', key: 'copy-key' })
  opts.push({ type: 'divider', key: 'd1' })
  opts.push({
    label: () => h('span', { style: { color: 'var(--n-error-color, #d03050)' } }, '删除'),
    key: 'delete',
  })
  return opts
})

function onCardClick(ev: MouseEvent) {
  emit('click', props.video, ev)
}

function onCardDblClick() {
  // 双击在父级被翻译成"打开公共站详情页"。父级会在收到 dblclick 时
  // 取消同时到达的 click 触发的 openDrawer，避免抽屉和新标签页同时出现。
  emit('dblclick', props.video)
}

function onCheckboxClick(ev: MouseEvent) {
  emit('check', props.video, ev)
}

/**
 * Hover 预览：去掉中央 play 按钮后，整张卡片就是预览触发面。
 *  - mouseenter 起 600 ms 计时器，到时再 emit('preview')，避免鼠标只是从一张卡上掠过
 *    就发起请求；
 *  - mouseleave 立即清掉计时器并 emit('preview-close')，让 hover popover 关闭。
 * isHovering 仍然要维护，因为 checkbox 显隐依赖它。
 */
let previewTimer: number | null = null
function onMouseEnter() {
  isHovering.value = true
  if (previewTimer) window.clearTimeout(previewTimer)
  previewTimer = window.setTimeout(() => {
    if (isHovering.value && coverWrapper.value) {
      emit('preview', props.video, coverWrapper.value)
    }
  }, 600)
}
function onMouseLeave() {
  isHovering.value = false
  if (previewTimer) {
    window.clearTimeout(previewTimer)
    previewTimer = null
  }
  emit('preview-close')
}

function onMenuSelect(action: string) {
  emit('menu', props.video, action)
}
</script>

<style scoped>
.video-card {
  position: relative;
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  background: var(--n-card-color);
  /*
    静态轮廓用 1px 边框 + 极轻底影，浅色页面 (#f5f6f8) 上既能浮起来又不显脏；
    hover 时把 y 偏移做大、阴影"长腿"，鼠标移过去有明显反馈。
  */
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.06),
    0 1px 2px rgba(0, 0, 0, 0.04);
  transition: box-shadow 0.2s ease, transform 0.2s ease;
}
.video-card:hover {
  transform: translateY(-3px);
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.08),
    0 4px 8px rgba(0, 0, 0, 0.06),
    0 16px 32px -8px rgba(0, 0, 0, 0.16);
}
/* 选中态：实色环 + 一抹淡背景，让"已选"在缩略图周边一眼可辨 */
.video-card--selected {
  box-shadow: 0 0 0 2px var(--n-primary-color);
}
.video-card--selected:hover {
  box-shadow:
    0 0 0 2px var(--n-primary-color),
    0 8px 24px rgba(0, 0, 0, 0.12);
}
.video-card--needs-attention {
  box-shadow: 0 0 0 2px var(--n-error-color);
}
.video-card--needs-attention:hover {
  box-shadow:
    0 0 0 2px var(--n-error-color),
    0 8px 24px rgba(208, 48, 80, 0.18);
}
.video-card--needs-attention.video-card--selected {
  /* 同时选中 + 失败：外失败红环 + 内选中绿环 */
  box-shadow:
    0 0 0 2px var(--n-error-color),
    0 0 0 4px var(--n-primary-color);
}

/* 封面区永远是深底（不管主题），因为视频缩略图本身就在黑底上更出彩 */
.cover-wrapper {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #0e0e12;
  overflow: hidden;
}
.cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.cover-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: rgba(255, 255, 255, 0.55);
  background: linear-gradient(135deg, #2a2a30 0%, #1a1a1f 100%);
  padding: 16px;
}
.cover-placeholder__ext {
  font-size: 22px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.78);
  letter-spacing: 0.5px;
}
.cover-placeholder__name {
  font-size: 11px;
  text-align: center;
  word-break: break-all;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.badge-top-left,
.badge-top-right {
  position: absolute;
  top: 8px;
  display: flex;
  gap: 6px;
  align-items: center;
  z-index: 4;
}
.badge-top-left { left: 8px; }
.badge-top-right { right: 8px; }

.badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.62);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.3px;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}
.badge--resolution {
  background: rgba(40, 32, 70, 0.78);
  color: #e0d5ff;
}
.badge--duration {
  background: rgba(0, 0, 0, 0.66);
}

.attention-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ff4d4f;
  box-shadow: 0 0 0 2px #fff, 0 0 6px rgba(255, 77, 79, 0.7);
}

/*
  位置 badge：与 ImageCard 共享一套视觉，确保两个管理页扫到的"已定位/未定位"
  视觉信号完全一致。
*/
.loc-badge {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}
.loc-badge--has {
  background: rgba(22, 119, 60, 0.78);
  color: #d8ffe2;
}
.loc-badge--missing {
  background: rgba(0, 0, 0, 0.45);
  color: rgba(255, 255, 255, 0.78);
}

.select-box {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.12s ease;
  pointer-events: none;
}
.select-box--visible {
  opacity: 1;
  pointer-events: auto;
}

/* 底部 1/3 渐变 + 信息条 */
.info-strip {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 22px 12px 10px 12px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.78) 0%, rgba(0, 0, 0, 0.6) 35%, transparent 100%);
  color: #fff;
  pointer-events: none;
  z-index: 2;
}
.info-strip__title {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}
.info-strip__meta {
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.78);
  flex-wrap: nowrap;
  overflow: hidden;
}
.info-strip__time {
  white-space: nowrap;
}
.info-strip__collection {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.meta-tag {
  pointer-events: none;
}

.more-btn {
  position: absolute;
  right: 6px;
  bottom: 6px;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.18s ease, background 0.18s ease;
  z-index: 5;
}
.video-card:hover .more-btn,
.video-card--has-selection-mode .more-btn {
  opacity: 1;
}
.more-btn:hover {
  background: rgba(0, 0, 0, 0.78);
}
</style>
