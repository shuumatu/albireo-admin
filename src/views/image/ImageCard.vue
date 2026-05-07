<template>
  <div
    :class="[
      'image-card',
      { 'image-card--selected': selected, 'image-card--needs-attention': attention, 'image-card--has-selection-mode': hasSelection },
    ]"
    @click="onCardClick"
    @dblclick="onCardDblClick"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
  >
    <!-- 1:1 方形封面区，整张图作背景 -->
    <div class="cover-wrapper" ref="coverWrapper">
      <img
        v-if="!coverFailed && cover"
        :src="cover"
        :alt="title"
        class="cover-img"
        loading="lazy"
        @error="coverFailed = true"
      />
      <div v-else class="cover-placeholder">
        <span class="cover-placeholder__ext">{{ extension }}</span>
        <span class="cover-placeholder__name">{{ image.fileName }}</span>
      </div>

      <!-- 左上：类型徽标 + 选中复选框（hover 或已有选中时显形） -->
      <div class="badge-top-left">
        <div
          class="select-box"
          :class="{ 'select-box--visible': showCheckbox }"
          @click.stop="onCheckboxClick($event)"
        >
          <n-checkbox :checked="selected" :focusable="false" />
        </div>
        <div v-if="typeText" :class="['badge', `badge--type-${image.type}`]">
          {{ typeText }}
        </div>
      </div>

      <!-- 右上：位置图钉 + 失败红点 -->
      <div class="badge-top-right">
        <!--
          位置 badge：扫一眼就能识别这张图是否定位了。
          - hasLocation === true：实心 pin，绿系底色（"已定位"）
          - hasLocation === false：outline pin，灰系底色（"未定位"，对运营是补位置的提示）
          - hasLocation 为 null/undefined（老接口兜底）：不渲染
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
      </div>

      <!-- 处理中状态遮罩（含状态文本 / 重试按钮） -->
      <ImageStatusOverlay
        v-if="overlayStatus"
        :status="overlayStatus"
        @retry="$emit('retry', image)"
      />

      <!-- 底部渐变 + 标题信息条 -->
      <div class="info-strip">
        <div class="info-strip__title" :title="title">{{ title }}</div>
        <div class="info-strip__meta">
          <span class="info-strip__time" :title="image.createdAt || ''">{{ relTime }}</span>
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
import { NCheckbox, NDropdown } from 'naive-ui'
import ImageStatusOverlay from './ImageStatusOverlay.vue'
import {
  toMediumUrl,
  imageTypeLabel,
  imageNeedsAttention,
  formatRelative,
  fileExtensionUpper,
} from './composables/imageFormat'
import type { ImageItem } from '../../api/images'

const props = defineProps<{
  image: ImageItem
  selected: boolean
  /** 是否已有任何选中（控制 checkbox 是否常驻可见） */
  hasSelection: boolean
}>()

const emit = defineEmits<{
  (e: 'click', image: ImageItem, ev: MouseEvent): void
  (e: 'dblclick', image: ImageItem): void
  (e: 'check', image: ImageItem, ev: MouseEvent): void
  (e: 'menu', image: ImageItem, action: string): void
  (e: 'retry', image: ImageItem): void
}>()

const coverWrapper = ref<HTMLElement | null>(null)
const coverFailed = ref(false)
const isHovering = ref(false)

const title = computed(() => props.image.title || props.image.fileName || '未命名图片')
const extension = computed(() => fileExtensionUpper(props.image.fileName))
const cover = computed(() => toMediumUrl(props.image.imageUrl))
const relTime = computed(() => formatRelative(props.image.createdAt))
const typeText = computed(() => imageTypeLabel(props.image.type))
const attention = computed(() => imageNeedsAttention(props.image.status))

const firstCollectionName = computed(() => props.image.collections?.[0]?.name ?? '')

/**
 * 位置态：true / false / null。
 * - 老接口未升级时 hasLocation 为 undefined → 归到 null（不显示），避免误判全部为"未定位"。
 */
const hasLocation = computed<boolean | null>(() => {
  const v = props.image.hasLocation
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
  const s = props.image.status
  if (!s || s === 'done') return ''
  return s
})

const showCheckbox = computed(() => props.selected || props.hasSelection || isHovering.value)

const menuOptions = computed(() => {
  const s = props.image.status
  const canEdit = !s || s === 'done' || s === 'pending'
  const opts: any[] = []
  if (canEdit) {
    opts.push({ label: '编辑', key: 'edit' })
    // 与视频侧对齐：菜单提供"在新标签页打开"作为双击的等价入口，
    // 用键盘党 / 触屏没法双击的场景兜底。
    opts.push({ label: '在新标签页打开', key: 'open-public' })
    opts.push({ label: '位置信息', key: 'location' })
    opts.push({ label: 'EXIF 信息', key: 'exif' })
    opts.push({ label: '评论', key: 'comment' })
  }
  if (s === 'failed') {
    opts.push({ label: '重试', key: 'retry' })
  }
  if (opts.length > 0) opts.push({ type: 'divider', key: 'd1' })
  opts.push({
    label: () => h('span', { style: { color: 'var(--n-error-color, #d03050)' } }, '删除'),
    key: 'delete',
  })
  return opts
})

function onCardClick(ev: MouseEvent) {
  emit('click', props.image, ev)
}

function onCardDblClick() {
  // 双击在父级被翻译成"在新标签页打开公共站详情"。父级会取消同时到达的 click 触发
  // 的 openDrawer，避免抽屉和新标签页同时出现。
  emit('dblclick', props.image)
}

function onCheckboxClick(ev: MouseEvent) {
  emit('check', props.image, ev)
}

function onMouseEnter() {
  isHovering.value = true
}
function onMouseLeave() {
  isHovering.value = false
}

function onMenuSelect(action: string) {
  emit('menu', props.image, action)
}
</script>

<style scoped>
.image-card {
  position: relative;
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  background: var(--n-card-color);
  /*
    静态轮廓用 1px 边框 + 极轻底影；hover 时把 y 偏移做大、阴影"长腿"，
    与 VideoCard 同一套交互节奏。
  */
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.06),
    0 1px 2px rgba(0, 0, 0, 0.04);
  transition: box-shadow 0.2s ease, transform 0.2s ease;
}
.image-card:hover {
  transform: translateY(-3px);
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.08),
    0 4px 8px rgba(0, 0, 0, 0.06),
    0 16px 32px -8px rgba(0, 0, 0, 0.16);
}
.image-card--selected {
  box-shadow: 0 0 0 2px var(--n-primary-color);
}
.image-card--selected:hover {
  box-shadow:
    0 0 0 2px var(--n-primary-color),
    0 8px 24px rgba(0, 0, 0, 0.12);
}
.image-card--needs-attention {
  box-shadow: 0 0 0 2px var(--n-error-color);
}
.image-card--needs-attention:hover {
  box-shadow:
    0 0 0 2px var(--n-error-color),
    0 8px 24px rgba(208, 48, 80, 0.18);
}
.image-card--needs-attention.image-card--selected {
  box-shadow:
    0 0 0 2px var(--n-error-color),
    0 0 0 4px var(--n-primary-color);
}

/*
  封面区方形栅格，深底——当 cover 加载中 / 透明 PNG 仍能保持视觉稳定。
  与 VideoCard 16:9 不同：图片 1:1 更适合多张图横向铺满网格。
*/
.cover-wrapper {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
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
.badge--type-photo  { background: rgba(22, 119, 60, 0.78); color: #d8ffe2; }
.badge--type-cover  { background: rgba(40, 32, 70, 0.78); color: #e0d5ff; }
.badge--type-other  { background: rgba(60, 60, 60, 0.78); color: #f0f0f0; }

.attention-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ff4d4f;
  box-shadow: 0 0 0 2px #fff, 0 0 6px rgba(255, 77, 79, 0.7);
}

/*
  位置 badge：与时长徽标 / 类型徽标视觉量级对齐，但更克制——18x18 圆角方，
  不喧宾夺主。"已定位"用主色，"未定位"用浅灰，让缺失态在缩略图上仍可辨。
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
.image-card:hover .more-btn,
.image-card--has-selection-mode .more-btn {
  opacity: 1;
}
.more-btn:hover {
  background: rgba(0, 0, 0, 0.78);
}
</style>
