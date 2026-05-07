<template>
  <div
    :class="[
      'image-row',
      { 'image-row--selected': selected, 'image-row--needs-attention': attention },
    ]"
    @click="onRowClick"
    @dblclick="onRowDblClick"
  >
    <!-- 左侧 checkbox：始终可见，列表场景下不绕弯子 -->
    <div class="row-check" @click.stop>
      <n-checkbox :checked="selected" @update:checked="$emit('check', image, $event)" />
    </div>

    <!-- 缩略图 + 状态遮罩 -->
    <div class="row-thumb">
      <img
        v-if="!coverFailed && cover"
        :src="cover"
        :alt="title"
        loading="lazy"
        @error="coverFailed = true"
      />
      <div v-else class="thumb-placeholder">{{ extension }}</div>
      <ImageStatusOverlay
        v-if="overlayStatus"
        :status="overlayStatus"
        @retry="$emit('retry', image)"
      />
    </div>

    <!-- 中间信息块 -->
    <div class="row-info">
      <div class="row-info__title-line">
        <span class="row-info__title" :title="title">{{ title }}</span>
        <span v-if="attention" class="attention-pill">需处理</span>
      </div>
      <div class="row-info__meta">
        <span v-if="typeText" class="meta-piece">{{ typeText }}</span>
        <span v-if="typeText && firstCollectionName" class="meta-sep">·</span>
        <span v-if="firstCollectionName" class="meta-piece" :title="firstCollectionName">合集：{{ firstCollectionName }}</span>
        <span v-if="(typeText || firstCollectionName) && shotAtText" class="meta-sep">·</span>
        <span v-if="shotAtText" class="meta-piece">{{ shotAtText }}</span>
        <!--
          位置态：列表场景下信息密度高，"未定位"是更值得提示的，所以这一档显示文字提醒；
          "已定位" 仅显示一个小图钉，避免每行都长出冗余文字。
          老接口未返回 hasLocation 时不显示，避免误判。
        -->
        <span
          v-if="hasLocation === false"
          class="meta-sep"
          :class="{ 'meta-sep--invisible': !(typeText || firstCollectionName || shotAtText) }"
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
      <div v-if="image.description" class="row-info__desc" :title="image.description">{{ image.description }}</div>
    </div>

    <!-- 右侧状态 / 时间 / 菜单 -->
    <div class="row-aside" @click.stop>
      <n-tag
        v-if="typeText"
        size="small"
        :type="typeTag"
        :bordered="false"
      >
        {{ typeText }}
      </n-tag>
      <span class="row-aside__time" :title="image.createdAt || ''">{{ relTime }}</span>
      <n-dropdown
        :options="menuOptions"
        trigger="click"
        placement="bottom-end"
        @select="(action: string) => $emit('menu', image, action)"
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
import { computed, h, ref } from 'vue'
import { NCheckbox, NButton, NDropdown, NTag } from 'naive-ui'
import ImageStatusOverlay from './ImageStatusOverlay.vue'
import {
  toMediumUrl,
  imageTypeLabel,
  imageTypeTagType,
  imageNeedsAttention,
  formatRelative,
  fileExtensionUpper,
} from './composables/imageFormat'
import type { ImageItem } from '../../api/images'

const props = defineProps<{
  image: ImageItem
  selected: boolean
  hasSelection: boolean
}>()

const emit = defineEmits<{
  (e: 'click', image: ImageItem, ev: MouseEvent): void
  (e: 'dblclick', image: ImageItem): void
  (e: 'check', image: ImageItem, checked: boolean): void
  (e: 'menu', image: ImageItem, action: string): void
  (e: 'retry', image: ImageItem): void
}>()

const coverFailed = ref(false)

const title = computed(() => props.image.title || props.image.fileName || '未命名图片')
const extension = computed(() => fileExtensionUpper(props.image.fileName))
const cover = computed(() => toMediumUrl(props.image.imageUrl))
const relTime = computed(() => formatRelative(props.image.createdAt))
const typeText = computed(() => imageTypeLabel(props.image.type))
const typeTag = computed(() => imageTypeTagType(props.image.type))
const attention = computed(() => imageNeedsAttention(props.image.status))
const firstCollectionName = computed(() => props.image.collections?.[0]?.name ?? '')

const shotAtText = computed(() => {
  if (!props.image.shotAt) return ''
  const d = new Date(props.image.shotAt)
  if (Number.isNaN(d.getTime())) return ''
  return `拍摄：${d.toLocaleDateString('zh-CN')}`
})

const hasLocation = computed<boolean | null>(() => {
  const v = props.image.hasLocation
  if (v === true) return true
  if (v === false) return false
  return null
})

const overlayStatus = computed(() => {
  const s = props.image.status
  if (!s || s === 'done') return ''
  return s
})

const menuOptions = computed(() => {
  const s = props.image.status
  const canEdit = !s || s === 'done' || s === 'pending'
  const opts: any[] = []
  if (canEdit) {
    opts.push({ label: '编辑', key: 'edit' })
    // 与 ImageCard / VideoListRow 对齐：菜单提供"在新标签页打开"作为双击的键盘 / 触屏兜底入口
    opts.push({ label: '在新标签页打开', key: 'open-public' })
    opts.push({ label: '位置信息', key: 'location' })
    opts.push({ label: 'EXIF 信息', key: 'exif' })
    opts.push({ label: '评论', key: 'comment' })
  }
  if (s === 'failed' || s === 'process_failed') {
    opts.push({ label: '重试', key: 'retry' })
  }
  if (opts.length > 0) opts.push({ type: 'divider', key: 'd1' })
  opts.push({
    label: () => h('span', { style: { color: 'var(--n-error-color, #d03050)' } }, '删除'),
    key: 'delete',
  })
  return opts
})

void emit
function onRowClick(ev: MouseEvent) {
  emit('click', props.image, ev)
}

function onRowDblClick() {
  emit('dblclick', props.image)
}
</script>

<style scoped>
.image-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}
.image-row:hover {
  background: rgba(0, 0, 0, 0.04);
}
.image-row--selected {
  background: color-mix(in srgb, var(--n-primary-color) 10%, transparent);
  border-color: color-mix(in srgb, var(--n-primary-color) 45%, transparent);
}
.image-row--selected:hover {
  background: color-mix(in srgb, var(--n-primary-color) 14%, transparent);
}
.image-row--needs-attention {
  border-color: color-mix(in srgb, var(--n-error-color) 50%, transparent);
  background: color-mix(in srgb, var(--n-error-color) 4%, transparent);
}

.row-check {
  flex: 0 0 auto;
}

/*
  行视图缩略图：68x68 方形（与 VideoListRow 的 120x68 不同），
  让多张图列表的视觉密度更高。
*/
.row-thumb {
  position: relative;
  flex: 0 0 auto;
  width: 68px;
  height: 68px;
  border-radius: 6px;
  overflow: hidden;
  background: #0e0e12;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.08);
}
.row-thumb img {
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
/*
  当"未定位"是 meta 行第一项时，前面没东西可分隔，藏掉这个分隔点
  仍然占位避免布局抖动（visibility:hidden 而不是 display:none）。
*/
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
</style>
