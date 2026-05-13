<template>
  <div class="rp-page">
    <header class="rp-header">
      <div class="rp-title-line">
        <h2 class="rp-title">重新处理</h2>
        <n-tag v-if="totalCount > 0" type="warning" size="small" round>
          {{ totalCount }} 个待处理
        </n-tag>
        <span v-if="lastUpdatedText" class="rp-updated">最近刷新 {{ lastUpdatedText }}</span>
      </div>
      <div class="rp-actions">
        <n-switch v-model:value="autoRefresh" size="small" />
        <span class="rp-actions-label">自动刷新</span>
        <n-button :loading="loading" size="small" tertiary @click="loadPage">刷新</n-button>
      </div>
    </header>

    <n-alert type="info" :show-icon="false" class="rp-help">
      <p>
        本页统一管理
        <strong>视频转码失败（含封面缺失）</strong>
        与
        <strong>图片处理失败</strong>
        的人工重试。重试时只会重做缺失部分（视频缺哪几档转哪几档；封面已存在则不再重抽帧）。
      </p>
      <p>
        若怀疑视频源 mp4 本身损坏（PyAV 拉视频失败、moov atom not found 等），请到
        <router-link to="/manager/embedding" class="rp-link">向量嵌入</router-link>
        页执行「重转码救援」，那条链路会同时重置 video_versions 与 embedding。
      </p>
    </n-alert>

    <n-tabs v-model:value="activeTab" type="line" size="small" @update:value="onTabChange">
      <n-tab-pane name="video" :tab="`视频 (${page.videoTotal})`">
        <n-data-table
          class="rp-table"
          remote
          :columns="videoColumns"
          :data="page.video"
          :loading="loading"
          :pagination="paginationProps"
          :row-key="(r: ReprocessVideoRow) => r.hash"
          :bordered="false"
          :single-line="false"
          size="small"
          @update:page="onPageChange"
          @update:page-size="onPageSizeChange"
        />
      </n-tab-pane>

      <n-tab-pane name="image" :tab="`图片 (${page.imageTotal})`">
        <n-data-table
          class="rp-table"
          remote
          :columns="imageColumns"
          :data="page.image"
          :loading="loading"
          :pagination="paginationProps"
          :row-key="(r: ReprocessImageRow) => r.hash"
          :bordered="false"
          :single-line="false"
          size="small"
          @update:page="onPageChange"
          @update:page-size="onPageSizeChange"
        />
      </n-tab-pane>
    </n-tabs>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  NAlert,
  NButton,
  NDataTable,
  NEllipsis,
  NSwitch,
  NTabs,
  NTabPane,
  NTag,
  useMessage,
} from 'naive-ui'
import type { DataTableColumns } from 'naive-ui'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-cn'
import {
  EXPECTED_QUALITIES,
  fetchReprocessList,
  retryReprocess,
  type ReprocessVideoRow,
  type ReprocessImageRow,
  type ReprocessListResponse,
} from '../api/reprocess'

dayjs.extend(relativeTime)
dayjs.locale('zh-cn')

const message = useMessage()

type ActiveTab = 'video' | 'image'

const activeTab = ref<ActiveTab>('video')
const pageNo = ref(1)
const pageSize = ref(20)
const page = ref<ReprocessListResponse>({ videoTotal: 0, imageTotal: 0, video: [], image: [] })
const loading = ref(false)
const retryingHash = ref<string | null>(null)
const autoRefresh = ref(true)
const lastUpdatedAt = ref<number | null>(null)
const nowTick = ref(0)
let timer: ReturnType<typeof setInterval> | null = null
let nowTimer: ReturnType<typeof setInterval> | null = null

const totalCount = computed(() => page.value.videoTotal + page.value.imageTotal)

const lastUpdatedText = computed(() => {
  void nowTick.value
  if (!lastUpdatedAt.value) return ''
  const diff = Math.max(0, Math.round((Date.now() - lastUpdatedAt.value) / 1000))
  if (diff < 5) return '刚刚'
  if (diff < 60) return `${diff} 秒前`
  return `${Math.floor(diff / 60)} 分钟前`
})

const paginationProps = computed(() => ({
  page: pageNo.value,
  pageSize: pageSize.value,
  itemCount:
    activeTab.value === 'video' ? page.value.videoTotal : page.value.imageTotal,
  pageSizes: [10, 20, 50, 100],
  showSizePicker: true,
}))

async function loadPage() {
  loading.value = true
  try {
    page.value = await fetchReprocessList({
      page: pageNo.value,
      pageSize: pageSize.value,
      type: activeTab.value,
    })
    lastUpdatedAt.value = Date.now()
  } catch (err: any) {
    message.error(`加载重新处理列表失败：${err?.message ?? '未知错误'}`)
  } finally {
    loading.value = false
  }
}

function onPageChange(p: number) {
  pageNo.value = p
  loadPage()
}
function onPageSizeChange(s: number) {
  pageSize.value = s
  pageNo.value = 1
  loadPage()
}
function onTabChange() {
  pageNo.value = 1
  loadPage()
}

async function onRetry(mediaType: 'video' | 'image', hash: string) {
  retryingHash.value = hash
  try {
    const res = await retryReprocess(mediaType, hash)
    if (res?.ok) {
      const detail = mediaType === 'video'
        ? `${(res.requeued ?? []).join(', ') || '（无缺失档）'}${res.needCover ? ' + 封面' : ''}`
        : '处理任务已重投'
      message.success(`已重新投递: ${detail}`)
      // worker 落库需要一拍
      setTimeout(loadPage, 1000)
    } else {
      message.error(res?.error ?? '重投失败')
    }
  } catch (err: any) {
    const detail = err?.response?.data?.error ?? err?.message ?? err
    message.error(`重投失败：${detail}`)
  } finally {
    retryingHash.value = null
  }
}

function statusTagType(status: string) {
  if (status === 'transcode_failed') return 'error'
  if (status === 'process_failed') return 'error'
  if (status === 'transcoding') return 'warning'
  if (status === 'processing') return 'warning'
  if (status === 'done') return 'success'
  return 'default'
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    uploading: '上传中',
    pending: '等待处理',
    transcoding: '转码中',
    ai_analyzing: 'AI 分析中',
    ai_analyze_failed: 'AI 分析失败',
    transcode_failed: '转码失败',
    process_failed: '处理失败',
    processing: '处理中',
    done: '已完成',
    failed: '失败',
  }
  return map[status] ?? status
}

const videoColumns = computed<DataTableColumns<ReprocessVideoRow>>(() => [
  {
    title: '文件',
    key: 'fileName',
    minWidth: 220,
    render: (r) =>
      h('div', { class: 'rp-file-cell' }, [
        h(NEllipsis, { class: 'rp-file-name' }, { default: () => r.fileName ?? '—' }),
        h('div', { class: 'rp-file-hash', title: r.hash }, `#${r.hash.slice(0, 12)}`),
      ]),
  },
  {
    title: '状态',
    key: 'status',
    width: 110,
    render: (r) =>
      h(
        NTag,
        { type: statusTagType(r.status), size: 'small', round: true, bordered: false },
        { default: () => statusLabel(r.status) }
      ),
  },
  {
    title: '已完成档位',
    key: 'doneQualities',
    width: 180,
    render: (r) =>
      h(
        'div',
        { class: 'rp-q-row' },
        EXPECTED_QUALITIES.map((q) => {
          const ok = r.doneQualities.includes(q)
          return h(
            NTag,
            {
              type: ok ? 'success' : 'default',
              size: 'small',
              round: true,
              bordered: false,
              class: ok ? '' : 'is-faded',
            },
            { default: () => q }
          )
        })
      ),
  },
  {
    title: '失败项',
    key: 'failedItems',
    width: 220,
    render: (r) => {
      const chips: any[] = []
      for (const q of r.missingQualities) {
        chips.push(
          h(
            NTag,
            { type: 'warning', size: 'small', round: true, bordered: false, key: q },
            { default: () => q }
          )
        )
      }
      if (!r.coverPresent) {
        chips.push(
          h(
            NTag,
            { type: 'warning', size: 'small', round: true, bordered: false, key: 'cover' },
            { default: () => '缩略图' }
          )
        )
      }
      return chips.length > 0
        ? h('div', { class: 'rp-q-row' }, chips)
        : h('span', { class: 'rp-empty-cell' }, '—')
    },
  },
  {
    title: '上传时间',
    key: 'createdAt',
    width: 130,
    render: (r) => (r.createdAt ? dayjs(r.createdAt).fromNow() : '—'),
  },
  {
    title: '操作',
    key: 'actions',
    width: 130,
    render: (row) => {
      const noWork = row.missingQualities.length === 0 && row.coverPresent
      return h(
        NButton,
        {
          size: 'small',
          type: 'warning',
          tertiary: true,
          loading: retryingHash.value === row.hash,
          onClick: () => onRetry('video', row.hash),
        },
        { default: () => (noWork ? '回到处理流程' : '重新处理') }
      )
    },
  },
])

const imageColumns = computed<DataTableColumns<ReprocessImageRow>>(() => [
  {
    title: '文件',
    key: 'fileName',
    minWidth: 240,
    render: (r) =>
      h('div', { class: 'rp-file-cell' }, [
        h(NEllipsis, { class: 'rp-file-name' }, { default: () => r.fileName ?? '—' }),
        h('div', { class: 'rp-file-hash', title: r.hash }, `#${r.hash.slice(0, 12)}`),
      ]),
  },
  {
    title: '状态',
    key: 'status',
    width: 110,
    render: (r) =>
      h(
        NTag,
        { type: statusTagType(r.status), size: 'small', round: true, bordered: false },
        { default: () => statusLabel(r.status) }
      ),
  },
  {
    title: '失败项',
    key: 'failedItems',
    width: 200,
    render: () =>
      h(
        NTag,
        { type: 'warning', size: 'small', round: true, bordered: false },
        { default: () => '图片处理' }
      ),
  },
  {
    title: '上传时间',
    key: 'createdAt',
    width: 130,
    render: (r) => (r.createdAt ? dayjs(r.createdAt).fromNow() : '—'),
  },
  {
    title: '操作',
    key: 'actions',
    width: 130,
    render: (row) =>
      h(
        NButton,
        {
          size: 'small',
          type: 'warning',
          tertiary: true,
          loading: retryingHash.value === row.hash,
          onClick: () => onRetry('image', row.hash),
        },
        { default: () => '重新处理' }
      ),
  },
])

function startPolling() {
  stopPolling()
  // 重新处理页不像处理进度页那么频繁；10s 一次足够看到 worker 完成回填
  timer = setInterval(loadPage, 10_000)
}
function stopPolling() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
watch(autoRefresh, (v) => {
  if (v) startPolling()
  else stopPolling()
})

onMounted(() => {
  loadPage()
  if (autoRefresh.value) startPolling()
  nowTimer = setInterval(() => {
    nowTick.value++
  }, 1000)
})

onUnmounted(() => {
  stopPolling()
  if (nowTimer) {
    clearInterval(nowTimer)
    nowTimer = null
  }
})
</script>

<style scoped>
.rp-page {
  padding: 20px 32px 40px;
  max-width: 1280px;
  margin: 0 auto;
}

.rp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.rp-title-line {
  display: flex;
  align-items: center;
  gap: 12px;
}

.rp-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.rp-updated {
  font-size: 12px;
  color: var(--n-text-color-3);
}

.rp-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rp-actions-label {
  font-size: 12px;
  color: var(--n-text-color-2);
}

.rp-link {
  color: var(--n-primary-color);
  text-decoration: none;
}
.rp-link:hover {
  text-decoration: underline;
}

.rp-help {
  margin-bottom: 12px;
}

.rp-help :deep(p) {
  margin: 0 0 4px 0;
  font-size: 12px;
}

.rp-table {
  background: var(--n-card-color);
  border-radius: 8px;
  border: 1px solid var(--n-divider-color);
}

.rp-file-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.rp-file-name {
  font-size: 13px;
  color: var(--n-text-color);
}

.rp-file-hash {
  font-size: 11px;
  color: var(--n-text-color-3);
  font-family: 'JetBrains Mono', 'Consolas', 'Menlo', monospace;
}

.rp-q-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.rp-q-row :deep(.is-faded) {
  opacity: 0.45;
}

.rp-empty-cell {
  color: var(--n-text-color-3);
}
</style>
