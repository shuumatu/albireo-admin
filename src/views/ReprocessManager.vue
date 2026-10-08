<template>
  <div class="rp-page admin-page">
    <ProcessingNavigation />
    <header class="rp-header admin-page-header">
      <div class="rp-title-line">
        <h2 class="rp-title">重新处理</h2>
        <n-tag v-if="totalCount > 0" type="warning" size="small" round>
          {{ totalCount }} 个待处理
        </n-tag>
        <span v-if="lastUpdatedText" class="rp-updated">最近刷新 {{ lastUpdatedText }}</span>
      </div>
      <div v-if="workspace === 'failed'" class="rp-actions">
        <n-switch v-model:value="autoRefresh" size="small" aria-label="自动刷新重新处理列表" />
        <span class="rp-actions-label">自动刷新</span>
        <n-button :loading="loading" size="small" tertiary @click="loadPage">刷新</n-button>
      </div>
    </header>
    <p class="rp-description">集中恢复处理失败的媒体，保留已经生成的可用版本。</p>
    <n-tabs v-model:value="workspace" type="segment" class="rp-workspace">
      <n-tab name="failed">失败恢复 · {{ totalCount }}</n-tab>
      <n-tab name="migration">播放与预览升级</n-tab>
    </n-tabs>
    <DerivativeMigration v-if="workspace === 'migration'" />
    <section v-show="workspace === 'failed'" aria-label="失败媒体恢复">
    <n-alert v-if="loadError" type="error" class="rp-help">{{ loadError }}</n-alert>

    <div class="rp-guide"><strong>只重做失败或缺失的部分</strong><p>视频保留已完成的清晰度与封面，图片重新生成处理结果。已删除的媒体不会出现在操作清单中。</p><router-link to="/manager/task-progress">查看处理进度 →</router-link></div>

    <div class="rp-toolbar admin-toolbar"><n-input v-model:value="keyword" clearable placeholder="筛选本页文件名或 Hash" aria-label="筛选本页文件" /><span>当前页筛选 · {{ autoRefresh ? '每 10 秒自动刷新' : '自动刷新已暂停' }}</span></div>
    <n-tabs v-model:value="activeTab" type="line" size="small" @update:value="onTabChange">
      <n-tab-pane name="video" :tab="`视频 (${page.videoTotal})`">
        <n-data-table
          class="rp-table"
          remote
          :columns="videoColumns"
          :data="filteredVideos"
          :scroll-x="980"
          :loading="loading"
          :pagination="paginationProps"
          :row-key="(r: ReprocessVideoRow) => r.hash"
          :bordered="false"
          :single-line="true"
          size="small"
          @update:page="onPageChange"
          @update:page-size="onPageSizeChange"
        ><template #empty><div class="rp-empty"><strong>{{ keyword ? '本页没有匹配的媒体' : '暂无需要恢复的媒体' }}</strong><span>{{ keyword ? '请清除筛选条件或切换分页。' : '处理失败的媒体会在这里出现，可到处理进度查看进行中的任务。' }}</span><n-button v-if="keyword" text type="primary" @click="keyword = ''">清除筛选</n-button></div></template></n-data-table>
      </n-tab-pane>

      <n-tab-pane name="image" :tab="`图片 (${page.imageTotal})`">
        <n-data-table
          class="rp-table"
          remote
          :columns="imageColumns"
          :data="filteredImages"
          :scroll-x="800"
          :loading="loading"
          :pagination="paginationProps"
          :row-key="(r: ReprocessImageRow) => r.hash"
          :bordered="false"
          :single-line="true"
          size="small"
          @update:page="onPageChange"
          @update:page-size="onPageSizeChange"
        ><template #empty><div class="rp-empty"><strong>{{ keyword ? '本页没有匹配的媒体' : '暂无需要恢复的媒体' }}</strong><span>{{ keyword ? '请清除筛选条件或切换分页。' : '处理失败的媒体会在这里出现，可到处理进度查看进行中的任务。' }}</span><n-button v-if="keyword" text type="primary" @click="keyword = ''">清除筛选</n-button></div></template></n-data-table>
      </n-tab-pane>
    </n-tabs>
    </section>
  </div>
</template>

<script setup lang="ts">
import ProcessingNavigation from '../components/ProcessingNavigation.vue'
import DerivativeMigration from '../components/DerivativeMigration.vue'
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

const workspace = ref<'failed' | 'migration'>('failed')
const activeTab = ref<ActiveTab>('video')
const pageNo = ref(1)
const pageSize = ref(20)
const page = ref<ReprocessListResponse>({ videoTotal: 0, imageTotal: 0, video: [], image: [] })
const loading = ref(false)
const loadError = ref('')
const keyword = ref('')
const matchesKeyword = (row: { fileName?: string | null; hash: string }) => (String(row.fileName ?? '') + ' ' + row.hash).toLowerCase().includes(keyword.value.trim().toLowerCase())
const filteredVideos = computed(() => page.value.video.filter(matchesKeyword))
const filteredImages = computed(() => page.value.image.filter(matchesKeyword))
let loadSequence = 0
let disposed = false
let retryTimer: ReturnType<typeof setTimeout> | null = null
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
  if (disposed) return
  const sequence = ++loadSequence
  loading.value = true
  try {
    const result = await fetchReprocessList({
      page: pageNo.value,
      pageSize: pageSize.value,
      type: activeTab.value,
    })
    if (disposed || sequence !== loadSequence) return
    const total = activeTab.value === 'video' ? result.videoTotal : result.imageTotal
    const lastPage = Math.max(1, Math.ceil(total / pageSize.value))
    if (pageNo.value > lastPage) { pageNo.value = lastPage; await loadPage(); return }
    page.value = result
    loadError.value = ''
    lastUpdatedAt.value = Date.now()
  } catch (err: any) {
    if (!disposed && sequence === loadSequence) loadError.value = `加载失败，已保留上次结果：${err?.message ?? '请稍后刷新重试'}`
  } finally {
    if (sequence === loadSequence) loading.value = false
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
  keyword.value = ''
  pageNo.value = 1
  loadPage()
}

async function onRetry(mediaType: 'video' | 'image', hash: string) {
  if (retryingHash.value) return
  retryingHash.value = hash
  try {
    const res = await retryReprocess(mediaType, hash)
    if (res?.ok) {
      const detail = mediaType === 'video'
        ? `${(res.requeued ?? []).join(', ') || '（无缺失档）'}${res.needCover ? ' + 封面' : ''}`
        : '处理任务已重投'
      if (res.message) message.info('所有输出已齐全，无需重新处理')
      else message.success(`已重新投递: ${detail}`)
      // worker 落库需要一拍
      if (!disposed) { if (retryTimer) clearTimeout(retryTimer); retryTimer = setTimeout(loadPage, 1000) }
    } else {
      message.error(res?.error ?? '重投失败')
    }
  } catch (err: any) {
    const detail = err?.response?.data?.error ?? err?.message ?? err
    if (err?.response?.status === 404) { message.warning('媒体已删除或状态已变化，正在刷新清单'); await loadPage() }
    else message.error(`重投失败：${detail}`)
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
    width: 140,
    fixed: 'right',
    render: (row) => {
      const noWork = row.missingQualities.length === 0 && row.coverPresent
      return h(
        NButton,
        {
          size: 'small',
          type: 'warning',
          tertiary: true,
          loading: retryingHash.value === row.hash,
          disabled: noWork || (retryingHash.value !== null && retryingHash.value !== row.hash),
          onClick: () => onRetry('video', row.hash),
        },
        { default: () => (noWork ? '输出已齐全' : '重新处理') }
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
    width: 140,
    fixed: 'right',
    render: (row) =>
      h(
        NButton,
        {
          size: 'small',
          type: 'warning',
          tertiary: true,
          loading: retryingHash.value === row.hash,
          disabled: retryingHash.value !== null && retryingHash.value !== row.hash,
          onClick: () => onRetry('image', row.hash),
        },
        { default: () => '重新处理' }
      ),
  },
])

function startPolling() {
  stopPolling()
  // 重新处理页不像处理进度页那么频繁；10s 一次足够看到 worker 完成回填
  timer = setInterval(() => { if (!document.hidden && workspace.value === 'failed' && !loading.value && !retryingHash.value) void loadPage() }, 10_000)
}
function stopPolling() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
watch(workspace, value => { if (value === 'failed') void loadPage() })
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
  disposed = true
  loadSequence++
  if (retryTimer) clearTimeout(retryTimer)
  stopPolling()
  if (nowTimer) {
    clearInterval(nowTimer)
    nowTimer = null
  }
})
</script>

<style scoped>
.rp-workspace { margin:0 0 20px; }.rp-guide { border:1px solid var(--n-divider-color); background:var(--n-card-color); border-radius:12px; padding:18px 20px; }.rp-guide strong { font-size:14px; }.rp-guide p { color:var(--n-text-color-3); font-size:13px; margin:6px 0; }.rp-guide a { font-size:12px; color:var(--admin-accent,#2f7b5b); text-decoration:none; }.rp-empty { display:flex; flex-direction:column; align-items:center; gap:8px; padding:28px 12px; }.rp-empty span { font-size:12px; color:var(--n-text-color-3); }

.rp-description { margin: 0 0 22px; color: var(--n-text-color-3); font-size: 13px; }.rp-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px; background: var(--n-card-color); border: 1px solid var(--n-divider-color); border-radius: 14px; margin: 18px 0 10px; }.rp-toolbar .n-input { max-width: 330px; }.rp-toolbar span { color: var(--n-text-color-3); font-size: 12px; white-space: nowrap; }
@media(max-width:680px) { .rp-page { padding: 20px 16px !important; }.rp-title-line { flex-wrap: wrap; }.rp-toolbar { align-items: stretch; flex-direction: column; }.rp-toolbar .n-input { max-width: none; } }
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

:deep(.rp-file-cell) {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

:deep(.rp-file-name) {
  font-size: 13px;
  color: var(--n-text-color);
}

:deep(.rp-file-hash) {
  font-size: 11px;
  color: var(--n-text-color-3);
  font-family: 'JetBrains Mono', 'Consolas', 'Menlo', monospace;
}

:deep(.rp-q-row) {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

:deep(.rp-q-row .is-faded) {
  opacity: 0.45;
}

:deep(.rp-empty-cell) {
  color: var(--n-text-color-3);
}
</style>
