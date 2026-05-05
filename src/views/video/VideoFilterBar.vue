<template>
  <div class="filter-bar">
    <!-- 主行：标题 / 搜索 / 主筛选下拉 / 视图切换 -->
    <div class="filter-bar__main">
      <h2 class="page-title">视频管理</h2>

      <n-input
        v-model:value="localKeyword"
        placeholder="搜索标题 / 文件名 / 描述"
        clearable
        size="medium"
        class="search-input"
        @input="onKeywordInput"
        @keyup.enter="flushKeyword"
      >
        <template #prefix>
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path
              d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
              fill="currentColor"
            />
          </svg>
        </template>
      </n-input>

      <n-select
        :value="state.status"
        placeholder="状态"
        :options="statusOptions"
        clearable
        size="medium"
        style="width: 130px;"
        @update:value="onStatusChange"
      />

      <n-select
        :value="state.visibility"
        placeholder="可见性"
        :options="visibilityOptions"
        clearable
        size="medium"
        style="width: 120px;"
        @update:value="onVisibilityChange"
      />

      <n-select
        :value="state.collectionId == null ? null : String(state.collectionId)"
        placeholder="合集"
        :options="collectionOptions"
        clearable
        size="medium"
        style="width: 160px;"
        @update:value="onCollectionChange"
      />

      <n-select
        :value="orderKey"
        :options="orderOptions"
        size="medium"
        style="width: 150px;"
        @update:value="onOrderChange"
      />

      <div style="flex: 1 1 auto;"></div>

      <n-button-group>
        <n-button
          :type="state.viewMode === 'grid' ? 'primary' : 'default'"
          size="medium"
          @click="$emit('change-view', 'grid')"
          title="网格视图 (g)"
        >
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path
              d="M3 3h7v7H3V3m11 0h7v7h-7V3m-11 11h7v7H3v-7m11 0h7v7h-7v-7"
              fill="currentColor"
            />
          </svg>
        </n-button>
        <n-button
          :type="state.viewMode === 'list' ? 'primary' : 'default'"
          size="medium"
          @click="$emit('change-view', 'list')"
          title="列表视图 (l)"
        >
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path
              d="M3 4h18v3H3V4m0 7h18v3H3v-3m0 7h18v3H3v-3z"
              fill="currentColor"
            />
          </svg>
        </n-button>
      </n-button-group>

      <n-dropdown
        :options="settingsOptions"
        trigger="click"
        @select="onSettingsSelect"
      >
        <n-button size="medium" quaternary>
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path
              d="M19.14 12.94a7.49 7.49 0 0 0 .05-1.88l2.03-1.58a.5.5 0 0 0 .12-.61l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.62-.94l-.36-2.54A.5.5 0 0 0 13.96 2h-3.84a.5.5 0 0 0-.49.42l-.36 2.54a7.03 7.03 0 0 0-1.62.94l-2.39-.96a.5.5 0 0 0-.6.22L2.74 8.48a.5.5 0 0 0 .12.61l2.03 1.58a7.49 7.49 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.61l1.92 3.32c.14.24.43.34.6.22l2.39-.96c.5.4 1.05.71 1.62.94l.36 2.54a.5.5 0 0 0 .49.42h3.84a.5.5 0 0 0 .49-.42l.36-2.54a7.03 7.03 0 0 0 1.62-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.61l-2.03-1.58zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"
              fill="currentColor"
            />
          </svg>
        </n-button>
      </n-dropdown>
    </div>

    <!-- 第二行：激活的筛选 chip。无筛选时折叠不占空间。 -->
    <div v-if="activeChips.length > 0" class="filter-bar__chips">
      <n-tag
        v-for="chip in activeChips"
        :key="chip.key"
        closable
        size="small"
        type="info"
        @close="$emit('clear-chip', chip.key)"
      >
        {{ chip.label }}
      </n-tag>
      <n-button text size="small" @click="$emit('clear-all-filters')">
        清除全部筛选
      </n-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NInput, NSelect, NButton, NButtonGroup, NDropdown, NTag } from 'naive-ui'
import type { ViewMode, DensityMode } from './composables/useVideoQuery'
import type { VideoListOrderBy, VideoListOrder } from '../../api/manager'

interface FilterState {
  keyword: string
  status: string | null
  visibility: string | null
  orderBy: VideoListOrderBy
  order: VideoListOrder
  viewMode: ViewMode
  density: DensityMode
  hoverPreview: boolean
  collectionId: number | null
}

const props = defineProps<{
  state: FilterState
  collections: { id: number; name: string }[]
  activeChips: { key: string; label: string }[]
}>()

const emit = defineEmits<{
  (e: 'update-keyword', value: string): void
  (e: 'update-status', value: string | null): void
  (e: 'update-visibility', value: string | null): void
  (e: 'update-collection', value: number | null): void
  (e: 'update-order', orderBy: VideoListOrderBy, order: VideoListOrder): void
  (e: 'change-view', mode: ViewMode): void
  (e: 'change-density', density: DensityMode): void
  (e: 'toggle-hover-preview'): void
  (e: 'clear-chip', key: string): void
  (e: 'clear-all-filters'): void
}>()

// keyword 用本地 ref + emit 实现"输入即派发"，由父组件的 useVideoQuery 做 debounce
const localKeyword = ref(props.state.keyword)
watch(() => props.state.keyword, (v) => { if (v !== localKeyword.value) localKeyword.value = v })

let kwTimer: number | null = null
function onKeywordInput(v: string) {
  if (kwTimer) window.clearTimeout(kwTimer)
  kwTimer = window.setTimeout(() => emit('update-keyword', v), 80)
}
function flushKeyword() {
  if (kwTimer) {
    window.clearTimeout(kwTimer)
    kwTimer = null
  }
  emit('update-keyword', localKeyword.value)
}

const statusOptions = [
  { label: '已完成', value: 'done' },
  { label: '上传中', value: 'uploading' },
  { label: '待处理', value: 'pending' },
  { label: '处理中', value: 'processing' },
  { label: '转码中', value: 'transcoding' },
  { label: 'AI 分析中', value: 'ai_analyzing' },
  { label: '处理失败', value: 'failed' },
  { label: 'AI 分析失败', value: 'ai_analyze_failed' },
]

const visibilityOptions = [
  { label: '公开', value: 'public' },
  { label: '好友可见', value: 'friends' },
  { label: '私密', value: 'private' },
]

const collectionOptions = computed(() =>
  props.collections.map((c) => ({ label: c.name, value: String(c.id) }))
)

const orderOptions = [
  { label: '最新创建', value: 'createdAt:desc' },
  { label: '最早创建', value: 'createdAt:asc' },
  { label: '最近修改', value: 'updatedAt:desc' },
  { label: '时长 长 → 短', value: 'duration:desc' },
  { label: '时长 短 → 长', value: 'duration:asc' },
]

const orderKey = computed(() => `${props.state.orderBy}:${props.state.order}`)

const settingsOptions = computed(() => [
  {
    label: () => `密度：${densityLabel(props.state.density)}`,
    key: 'density-header',
    disabled: true,
  },
  { label: '紧凑', key: 'density-compact' },
  { label: '舒适', key: 'density-cozy' },
  { label: '宽松', key: 'density-spacious' },
  { type: 'divider', key: 'd1' },
  {
    label: () => (props.state.hoverPreview ? '悬停预览：开 (点击关闭)' : '悬停预览：关 (点击开启)'),
    key: 'toggle-preview',
  },
])

function densityLabel(d: DensityMode): string {
  return d === 'compact' ? '紧凑' : d === 'spacious' ? '宽松' : '舒适'
}

function onStatusChange(v: string | null) {
  emit('update-status', v)
}
function onVisibilityChange(v: string | null) {
  emit('update-visibility', v)
}
function onCollectionChange(v: string | null) {
  emit('update-collection', v == null ? null : Number(v))
}
function onOrderChange(v: string | null) {
  if (!v) return
  const [orderBy, order] = v.split(':') as [VideoListOrderBy, VideoListOrder]
  emit('update-order', orderBy, order)
}
function onSettingsSelect(key: string) {
  if (key.startsWith('density-')) {
    emit('change-density', key.replace('density-', '') as DensityMode)
  } else if (key === 'toggle-preview') {
    emit('toggle-hover-preview')
  }
}
</script>

<style scoped>
.filter-bar {
  position: sticky;
  top: 0;
  z-index: 30;
  /*
    底色与页面 body bg (#f5f6f8) 互补：用接近 cardColor 的 92% 不透明 + 强 blur，
    sticky 时下方内容透出一点冷灰，制造"飘"的层次感。
  */
  background: color-mix(in srgb, var(--n-card-color) 92%, transparent);
  padding: 14px 20px 10px 20px;
  border-bottom: 1px solid var(--n-divider-color);
  /* 极细底影暗示"浮在内容之上" */
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.02), 0 6px 12px -8px rgba(0, 0, 0, 0.08);
  backdrop-filter: saturate(1.4) blur(10px);
  -webkit-backdrop-filter: saturate(1.4) blur(10px);
}
.filter-bar__main {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.filter-bar__chips {
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.page-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  margin-right: 4px;
  padding-right: 8px;
  border-right: 1px solid var(--n-divider-color);
  line-height: 1.2;
  flex: 0 0 auto;
  color: var(--n-text-color);
}
.search-input {
  flex: 1 1 280px;
  min-width: 220px;
  max-width: 360px;
}
</style>
