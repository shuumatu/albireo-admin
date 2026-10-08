<template>
  <div class="scanner-app admin-page">
    <ProcessingNavigation />
    <header class="embedding-heading admin-page-header"><div><span class="embedding-eyebrow">AI / EMBEDDINGS</span><h1>向量嵌入</h1><p>查看向量覆盖率与运行状态，定位待处理媒体并恢复检索能力。</p></div><n-button secondary :loading="loading || heatmapLoading" @click="refreshStatsAndHeatmap">刷新概览</n-button></header>
    <n-alert v-if="dataError" type="error" class="embedding-error">{{ dataError }}</n-alert>
    <EmbeddingSpacePanel />
    <div class="runtime-strip">
      <div class="runtime-title"><span class="runtime-dot" :class="runtimeDotClass"></span><strong>Sidecar 运行时</strong><span>{{ runtimeLabel }}</span><code v-if="runtime?.pid">PID {{ runtime.pid }}</code></div>
      <div class="runtime-meta"><span v-if="runtime?.health?.model">{{ runtime.health.model }} · {{ runtime.health.dim }}d</span><span v-if="runtime?.lastError" class="runtime-error">{{ runtime.lastError }}</span></div>
      <div class="runtime-actions">
        <n-button v-if="runtime?.local && !runtime?.running && !runtime?.adoptedExternal && !runtime?.waitingForPort" size="tiny" type="primary" :loading="runtimeLoading" @click="controlRuntime('start')">启动</n-button>
        <n-button v-else-if="runtime?.local && runtime?.running && !runtime?.adoptedExternal" size="tiny" secondary :loading="runtimeLoading" @click="controlRuntime('restart')">重启</n-button>
        <n-button v-if="runtime?.local && runtime?.running && !runtime?.adoptedExternal" size="tiny" type="error" secondary :loading="runtimeLoading" @click="controlRuntime('stop')">停止</n-button>
        <n-button size="tiny" quaternary :loading="runtimeRefreshing" :disabled="runtimeLoading" @click="refreshRuntime">刷新</n-button>
      </div>
    </div>
    <!-- =======================  扫描器主窗口  ======================= -->
    <div class="scanner-window">
      <!-- 标题栏 -->
      <div class="window-titlebar">
        <span class="title-icon">▦</span>
        <span class="title-text">历史向量记录</span>
        <span class="title-sep">·</span>
        <span class="title-sub">{{ heatmapMediaType === 'image' ? '图片库' : '视频库' }}</span>
        <span class="title-spacer"></span>
        <span class="title-stat">
          已加载 <strong>{{ formatNumber(heatmapPoints.length) }}</strong>
          / 全库 <strong>{{ formatNumber(heatmapTotal) }}</strong>
        </span>
      </div>

      <!-- 紧凑工具栏（米色背景） -->
      <div class="window-toolbar">
        <div class="tb-row">
          <label class="tb-label">媒体库</label>
          <n-radio-group
            v-model:value="heatmapMediaType"
            size="small"
            @update:value="onMediaChange"
          >
            <n-radio-button value="image">图片</n-radio-button>
            <n-radio-button value="video">视频</n-radio-button>
          </n-radio-group>

          <span class="tb-divider"></span>

          <n-checkbox v-model:checked="autoRefresh" @update:checked="onAutoRefreshChange">
            自动刷新
          </n-checkbox>
          <n-input-number
            v-model:value="autoRefreshSec"
            :disabled="!autoRefresh"
            :min="10"
            :max="600"
            :step="10"
            size="small"
            style="width: 90px"
          />
          <span class="tb-hint">秒</span>
        </div>
      </div>

      <div class="overview-strip">
        <div class="overview-item"><span class="overview-k">历史图片覆盖率</span><strong>{{ coverage(overview?.images) }}%</strong><small>{{ formatNumber(overview?.images?.pending) }} 待处理</small></div>
        <div class="overview-item"><span class="overview-k">历史视频覆盖率</span><strong>{{ coverage(overview?.videos) }}%</strong><small>{{ formatNumber(overview?.videos?.pending) }} 待处理</small></div>
        <div class="overview-item"><span class="overview-k">正在处理</span><strong class="is-blue">{{ overview?.running ?? 0 }}</strong><small>实时任务</small></div>
        <div class="overview-item"><span class="overview-k">最近失败</span><strong class="is-red">{{ overview?.recentFailed ?? 0 }}</strong><small>保留 60 秒</small></div>
        <div class="overview-model"><span>模型校准</span><n-tag v-if="calibration?.enabled" type="success" size="small">已启用</n-tag><n-tag v-else type="warning" size="small">未启用</n-tag><span class="model-name">{{ calibration?.model || 'sidecar 未连接' }}</span><n-button size="tiny" secondary @click="refreshCalibration">刷新</n-button><n-button size="tiny" type="warning" secondary :loading="calibrating" @click="recalculate">重算</n-button></div>
      </div>

      <!-- 状态栏 -->
      <div class="window-status">
        <span class="status-dot" :class="{ 'is-busy': heatmapLoading }"></span>
        <span class="status-label">数据状态</span>
        <span class="status-sep">:</span>
        <span class="status-main">
          <template v-if="heatmapLoading">正在加载嵌入数据…</template>
          <template v-else-if="hoverInfo">{{ hoverInfo }}</template>
          <template v-else-if="heatmapPoints.length > 0">
            就绪 · 已加载 {{ formatNumber(heatmapPoints.length) }} 个媒体
            <span v-if="lastRefreshAt" class="status-time">· 最近刷新 {{ lastRefreshAt }}</span>
          </template>
          <template v-else>等待加载数据…</template>
        </span>
        <n-button text type="primary" size="small" class="status-detail" @click="showList">查看明细 ▸</n-button>
      </div>

      <!-- =====================  主体：画布 + 侧栏  ===================== -->
      <div class="window-main">
        <div class="canvas-frame" @mouseleave="clearHeatTip" @scroll="onWrapScroll">
          <canvas
            ref="heatmapCanvasRef"
            class="scanner-canvas"
            @mousemove="onHeatmapMouseMove"
            @click="onHeatmapClick"
          />
          <div
            v-show="heatTip.show && !selectedCell"
            class="heat-tip"
            :style="{ left: heatTip.x + 'px', top: heatTip.y + 'px' }"
          >
            {{ heatTip.text }}
          </div>
          <div v-if="heatmapPoints.length === 0 && !heatmapLoading" class="canvas-empty">
            <div class="empty-title">暂无数据</div>
            <div class="empty-sub">点击下方“刷新统计与分布”加载媒体状态</div>
          </div>
        </div>

        <!-- 3 档状态色卡（标签 → 色块 → 计数） -->
        <div class="status-sidebar">
          <div
            v-for="row in tierRows"
            :key="row.key"
            class="sb-row"
            role="button"
            tabindex="0"
            @keydown.enter="onTierClick(row.key)"
            @keydown.space.prevent="onTierClick(row.key)"
            :class="{ 'is-zero': row.count === 0 }"
            @click="onTierClick(row.key)"
            :title="row.tip"
          >
            <span class="sb-label">{{ row.label }}</span>
            <span class="sb-swatch" :style="{ background: row.color }"></span>
            <span class="sb-count">{{ formatNumber(row.count) }}</span>
          </div>

          <div class="sb-divider"></div>

          <div class="sb-summary">
            <div class="sb-sum-row">
              <span>已嵌入</span>
              <strong>{{ formatNumber(legendStats.embedded) }}</strong>
              <span class="sb-pct">{{ legendStats.embeddedPct }}%</span>
            </div>
            <div class="sb-sum-row">
              <span>未嵌入</span>
              <strong>{{ formatNumber(legendStats.pending) }}</strong>
              <span class="sb-pct">{{ legendStats.pendingPct }}%</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 详细数值行 -->
      <div class="window-info">
        <span class="info-item">
          <span class="info-key">已嵌入 / 总数</span>
          <span class="info-val">{{ formatNumber(overallDone) }} / {{ formatNumber(overallTotal) }}</span>
        </span>
        <span class="info-item">
          <span class="info-key">网格</span>
          <span class="info-val">{{ heatLayout.cols }} × {{ heatLayout.rows }}</span>
        </span>
        <span class="info-item">
          <span class="info-key">单元尺寸</span>
          <span class="info-val">{{ heatLayout.cellPx }}px</span>
        </span>
        <span class="info-item">
          <span class="info-key">渲染样本</span>
          <span class="info-val">{{ formatNumber(heatmapPoints.length) }} 格</span>
        </span>
        <span class="info-item info-warn" v-if="heatmapTotal > heatmapPoints.length && heatmapPoints.length > 0">
          <span class="info-key">提示</span>
          <span class="info-val">画布仅展示已加载样本，全库口径以上方「已嵌入 / 未嵌入」为准</span>
        </span>
      </div>

      <!-- 底部按钮组 + 右下角监控小盒 -->
      <div class="window-actions">
        <n-button
          size="small"
          type="primary"
          :loading="heatmapLoading"
          @click="refreshStatsAndHeatmap"
        >
          刷新统计与分布
        </n-button>
        <n-button size="small" @click="loadHeatmap" :loading="heatmapLoading">
          刷新分布图
        </n-button>

        <span class="actions-spacer"></span>

        <!-- 右下角监控小盒 -->
        <div class="metrics-box">
          <div class="m-row">
            <span class="m-key">样本</span>
            <span class="m-val">{{ formatNumber(heatmapPoints.length) }}</span>
          </div>
          <div class="m-row">
            <span class="m-key">完成率</span>
            <span class="m-val" :class="healthClass">{{ legendStats.healthPct }} %</span>
          </div>
        </div>
      </div>
    </div>

    <!-- =====================  格子操作 Popover（fixed，跟随点击位置） ===================== -->
    <div
      v-if="selectedCell"
      class="cell-popover"
      :style="{ left: selectedCell.xPx + 'px', top: selectedCell.yPx + 'px' }"
      @click.stop
    >
      <div class="cp-header">
        <span class="cp-swatch" :style="{ background: HEAT_COLORS[selectedCell.v] }"></span>
        <span class="cp-id">id&nbsp;=&nbsp;{{ selectedCell.id }}</span>
        <span class="cp-tier">{{ TIER_LABELS[selectedCell.v] }}</span>
        <span class="cp-spacer"></span>
        <button class="cp-close" @click="closeSelectedCell" title="关闭 (Esc)">✕</button>
      </div>
      <div class="cp-body">
        <div class="cp-tip">{{ TIER_TIPS[selectedCell.v] }}</div>
        <div class="cp-meta">
          <span>第 {{ selectedCell.idx + 1 }} 格</span>
          <span>·</span>
          <span>{{ heatmapMediaType === 'image' ? '图片库' : '视频库' }}</span>
        </div>
        <div class="cp-actions">
          <n-button
            size="tiny"
            type="primary"
            :loading="cellActionLoading"
            title="在最近登记的模型空间中创建嵌入任务"
            @click="onCellRetry"
          >
            重新嵌入
          </n-button>
          <n-button size="tiny" @click="onCellCopyId">复制 ID</n-button>
          <n-button size="tiny" @click="onCellLocateInList">在明细中查看</n-button>
        </div>
      </div>
    </div>

    <!-- =====================  媒体嵌入清单  ===================== -->
    <n-card class="list-card" :bordered="true" content-style="padding: 0">
      <div class="inventory-heading">
        <div><h2>媒体嵌入清单</h2><p>查看历史向量覆盖情况，筛选媒体并按需重新嵌入。</p></div>
        <n-radio-group v-model:value="mediaType" :disabled="listBusy" size="small" aria-label="媒体类型">
          <n-radio-button value="video">视频库</n-radio-button>
          <n-radio-button value="image">图片库</n-radio-button>
        </n-radio-group>
      </div>
      <div class="inventory-states" aria-label="按嵌入状态筛选">
        <button v-for="item in listStates" :key="item.value" type="button" class="inventory-state"
          :class="{ active: sourceFilter === item.value }" :aria-pressed="sourceFilter === item.value"
          :disabled="listBusy" @click="sourceFilter = item.value">
          <span><i :style="{ background: HEAT_COLORS[item.value] }"></i>{{ item.label }}</span>
          <strong>{{ formatNumber(item.count) }}</strong><small>{{ item.hint }}</small>
        </button>
      </div>
      <div class="inventory-toolbar">
        <n-input v-model:value="listKeyword" clearable :maxlength="200" :disabled="listBusy"
          placeholder="搜索全库名称、文件名、ID 或 Hash" aria-label="搜索媒体清单" @keydown.enter="searchList" />
        <n-button :loading="listLoading" :disabled="listBusy" @click="searchList">搜索</n-button>
        <n-button v-if="listKeyword" text :disabled="listBusy" @click="listKeyword = ''">清除</n-button>
        <span class="inventory-total" aria-live="polite">共 {{ listTotal }} 条结果</span>
        <n-button secondary :loading="listLoading" :disabled="listBusy" @click="loadList">刷新</n-button>
      </div>
      <div v-if="checkedIds.length" class="inventory-selection">
        <span>已选中本页 <strong>{{ checkedIds.length }}</strong> 项</span>
        <n-button size="small" type="primary" :disabled="listLoading || !!rowActionKey || cellActionLoading" :loading="batchRetryLoading" @click="retryCurrentBatch">重新嵌入所选</n-button>
        <n-button size="small" text :disabled="listBusy" @click="checkedIds = []">取消选择</n-button>
      </div>
      <n-alert v-if="listError" type="error" class="inventory-error">{{ listError }}</n-alert>
      <n-data-table class="inventory-table" remote :columns="columns" :data="rows"
        :row-key="(row: EmbeddingAdminRow) => row.id" :loading="listLoading" :pagination="false"
        v-model:checked-row-keys="checkedIds" :bordered="false" :single-line="true" :scroll-x="780">
        <template #empty>
          <div class="table-empty">
            <strong>{{ listLoading ? '正在加载媒体清单…' : listError ? '清单暂时无法加载' : listKeyword ? '没有找到匹配的媒体' : '此状态下暂无媒体' }}</strong>
            <span>{{ listLoading ? '正在获取最新结果。' : listError ? '请点击刷新重试。' : listKeyword ? '试试其他名称、完整 ID 或 Hash，或清除搜索条件。' : '可切换上方状态或媒体类型继续查看。' }}</span>
          </div>
        </template>
      </n-data-table>
      <div class="inventory-footer">
        <span>按 ID 从新到旧排列 · 勾选仅限当前页</span>
        <n-pagination v-model:page="listPage" v-model:page-size="listPageSize" :item-count="listTotal"
          :page-sizes="[10, 20, 50, 100]" show-size-picker :page-slot="5" :disabled="listBusy || listLoading"
          @update:page="loadList" @update:page-size="resizeList" />
      </div>
      <details class="inventory-help"><summary>这些状态代表什么？</summary>
        <p>主路径完成：通过原图或视频帧生成向量。封面兜底：使用封面生成，检索效果可能较弱。待嵌入：当前还没有历史向量。</p>
        <p>此清单展示历史记录；当前检索使用的向量空间请查看上方空间管理。图片清单只包含照片，不含视频封面。</p>
      </details>
    </n-card>
    <n-drawer v-model:show="detailVisible" :width="520" style="max-width: 100vw">
      <n-drawer-content title="媒体嵌入详情" closable>
        <template v-if="detailRow">
          <div class="inventory-preview"><n-image v-if="detailRow.previewUrl" :src="detailRow.previewUrl" :alt="rowTitle(detailRow)" object-fit="contain" /><n-empty v-else description="暂无预览图" /></div>
          <h3 class="inventory-detail-title">{{ rowTitle(detailRow) }}</h3>
          <n-descriptions label-placement="top" :column="1" bordered>
            <n-descriptions-item label="处理状态">{{ TIER_LABELS[(detailRow.embeddingSource ?? sourceFilter) as HeatmapTier] }}</n-descriptions-item>
            <n-descriptions-item label="文件名">{{ detailRow.fileName || '未命名' }}</n-descriptions-item>
            <n-descriptions-item label="媒体 ID">{{ detailRow.id }}</n-descriptions-item>
            <n-descriptions-item label="Hash"><span class="inventory-hash">{{ detailRow.hash }}</span><n-button text type="primary" @click="copyHash(detailRow)">复制</n-button></n-descriptions-item>
            <n-descriptions-item label="失败次数">{{ detailRow.embeddingAttempts ?? 0 }}</n-descriptions-item>
          </n-descriptions>
        </template>
        <template #footer><n-button v-if="detailRow?.uuid" secondary @click="openMedia(detailRow)">打开媒体详情 ↗</n-button></template>
      </n-drawer-content>
    </n-drawer>

    <!-- 右下悬浮：实时处理面板（自带 2s 轮询，无任务时自动隐藏，组件内 Teleport 到 body） -->
    <EmbeddingInFlightPanel @locate="onLocateTask" />
  </div>
</template>

<script setup lang="ts">
import ProcessingNavigation from '../components/ProcessingNavigation.vue'
import EmbeddingSpacePanel from '../components/EmbeddingSpacePanel.vue'
import { computed, h, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { DataTableColumns } from 'naive-ui'
import { NButton, NTag, NDropdown, useDialog, useMessage } from 'naive-ui'
import {
  getEmbeddingOverview,
  getEmbeddingCalibration,
  getEmbeddingRuntime,
  startEmbeddingRuntime,
  stopEmbeddingRuntime,
  restartEmbeddingRuntime,
  getEmbeddingHeatmap,
  getEmbeddingProgress,
  getEmbeddingSourceStats,
  listEmbeddingPage,
  retryEmbedding,
  retryEmbeddingBatch,
  recalculateEmbeddingCalibration,
  retranscodeVideo,
  type EmbeddingAdminRow,
  type EmbeddingProgressEnvelope,
  type EmbeddingSourceStatsEnvelope,
  type HeatmapTier
} from '../api/embedding'
import EmbeddingInFlightPanel from '../components/EmbeddingInFlightPanel.vue'
import { getPublicSiteOrigin } from './video/composables/videoFormat'

const message = useMessage()
const dialog = useDialog()

// ───────────────────────── 视觉常量 ─────────────────────────
// 3 档色卡：绿（主路径）/ 黄（兜底）/ 红（待嵌入）
const HEAT_COLORS = [
  '#22c55e', // 0 主路径已嵌入
  '#f5b800', // 1 封面兜底已嵌入
  '#ef4444'  // 2 待嵌入
] as const

const TIER_LABELS: Record<HeatmapTier, string> = {
  0: '主路径完成',
  1: '封面兜底',
  2: '待嵌入'
}

const TIER_TIPS: Record<HeatmapTier, string> = {
  0: '已通过视频帧或原图完成嵌入',
  1: '封面兜底已嵌入（embedding_source=1，检索质量略弱）',
  2: '当前没有向量，可从清单重新嵌入'
}

// 单元格自适应：cellPx 在 [HEAT_CELL_MIN, HEAT_CELL_MAX] 之间
const HEAT_TARGET_W = 760  // 画布目标宽度（控制每行格子数）
const HEAT_ASPECT = 0.5    // 高/宽
const HEAT_CELL_MIN = 9
const HEAT_CELL_MAX = 18
const HEAT_CELL_GAP = 2    // 单元格间距
const HEAT_BG = '#f5f5f5'  // 画布背景色（浅灰，间隙处自然显示出"网格"颗粒感）

// ───────────────────────── 响应式状态 ─────────────────────────
const loading = ref(false)
const listLoading = ref(false)
const heatmapLoading = ref(false)
const progress = ref<EmbeddingProgressEnvelope | null>(null)
const stats = ref<EmbeddingSourceStatsEnvelope | null>(null)
const overview = ref<any>(null)
const calibration = ref<Record<string, any> | null>(null)
const calibrating = ref(false)
const batchRetryLoading = ref(false)
const runtime = ref<any>(null)
const runtimeLoading = ref(false)
const runtimeRefreshing = ref(false)
const dataError = ref('')
const listError = ref('')
const listKeyword = ref('')
const rowActionKey = ref('')
let disposed = false
let heatmapSequence = 0
let listSequence = 0
let locateSequence = 0
let runtimeSequence = 0
let runtimeRefreshTimeout: ReturnType<typeof setTimeout> | null = null
let runtimeTimer: ReturnType<typeof setInterval> | null = null
const rows = ref<EmbeddingAdminRow[]>([])
const listPage = ref(1)
const listPageSize = ref(20)
const listTotal = ref(0)
const checkedIds = ref<number[]>([])
const detailVisible = ref(false)
const detailRow = ref<EmbeddingAdminRow | null>(null)
const listBusy = computed(() => batchRetryLoading.value || !!rowActionKey.value || cellActionLoading.value)
let searchTimer: ReturnType<typeof setTimeout> | undefined
const listStates = computed(() => [
  { value: 2 as const, label: '待嵌入', count: selectedListStats.value?.pending, hint: '尚未生成历史向量' },
  { value: 1 as const, label: '封面兜底', count: selectedListStats.value?.coverDone, hint: '可重新尝试主媒体' },
  { value: 0 as const, label: '主路径完成', count: selectedListStats.value?.fullDone, hint: '原图或视频帧已嵌入' },
])
function searchList() { clearTimeout(searchTimer); listPage.value = 1; checkedIds.value = []; void loadList() }
function resizeList() { listPage.value = 1; void loadList() }
function showMedia(row: EmbeddingAdminRow) { detailRow.value = { ...row }; detailVisible.value = true }
async function copyHash(row: EmbeddingAdminRow) {
  try { await navigator.clipboard.writeText(row.hash); message.success('Hash 已复制') }
  catch { message.warning('复制失败，可在详情中选择并复制 Hash') }
}
function confirmAction(title: string, content: string): Promise<boolean> {
  return new Promise(resolve => dialog.warning({ title, content, positiveText: '确认继续', negativeText: '取消',
    onPositiveClick: () => resolve(true), onNegativeClick: () => resolve(false), onClose: () => resolve(false), onMaskClick: () => resolve(false) }))
}
const mediaType = ref<'image' | 'video'>('video')
const heatmapMediaType = ref<'image' | 'video'>('video')
const sourceFilter = ref<0 | 1 | 2>(2)

const selectedListStats = computed(() => (
  mediaType.value === 'image' ? stats.value?.images : stats.value?.videos
))

type HeatmapPoint = { id: number; v: HeatmapTier }
const heatmapPoints = ref<HeatmapPoint[]>([])
const heatmapTotal = ref(0)
const heatmapReturned = ref(0)
const heatmapLimit = ref(25000)
const heatmapCanvasRef = ref<HTMLCanvasElement | null>(null)
const lastRefreshAt = ref<string>('')
const hoverInfo = ref<string>('')

const heatTip = ref({ show: false, x: 0, y: 0, text: '' })
const heatLayout = ref({ cols: 1, rows: 1, cellPx: HEAT_CELL_MAX })

// 选中格子（点击触发，弹出操作 popover；fixed 定位，跟随屏幕坐标）
type SelectedCell = {
  idx: number
  id: number
  v: HeatmapTier
  xPx: number  // viewport 坐标（fixed 定位）
  yPx: number
}
const selectedCell = ref<SelectedCell | null>(null)
const cellActionLoading = ref(false)

// 自动刷新
const autoRefresh = ref(false)
const autoRefreshSec = ref(60)
let autoRefreshTimer: ReturnType<typeof setInterval> | null = null

// ───────────────────────── 计算属性 ─────────────────────────
/** 3 档样本计数（基于已加载到画布的 cells） */
const tierCounts = computed<number[]>(() => {
  const counts = [0, 0, 0]
  for (const p of heatmapPoints.value) {
    const v = p.v
    if (v >= 0 && v <= 2) counts[v]++
  }
  return counts
})

const tierRows = computed(() => {
  const c = tierCounts.value
  return ([0, 1, 2] as HeatmapTier[]).map((k) => ({
    key: k,
    label: TIER_LABELS[k],
    color: HEAT_COLORS[k],
    count: c[k] ?? 0,
    tip: TIER_TIPS[k]
  }))
})

/** 全库 3 档（来自 source-stats，反映真实总量） */
const legendStats = computed(() => {
  const s = heatmapMediaType.value === 'image' ? stats.value?.images : stats.value?.videos
  const fullDone = s?.fullDone ?? 0
  const coverDone = s?.coverDone ?? 0
  const pending = s?.pending ?? 0
  const total = s?.total ?? 0
  const embedded = fullDone + coverDone
  const embeddedPct = total > 0 ? Math.round((embedded / total) * 1000) / 10 : 0
  const pendingPct = total > 0 ? Math.round((pending / total) * 1000) / 10 : 0
  // 健康率 = 主路径占比（最严格口径）
  const healthPct = total > 0 ? Math.round((fullDone / total) * 1000) / 10 : 0
  return { embedded, pending, embeddedPct, pendingPct, healthPct, total }
})

const overallDone = computed(() => {
  const p = heatmapMediaType.value === 'image' ? progress.value?.images : progress.value?.videos
  return p?.done ?? 0
})
const overallTotal = computed(() => {
  const p = heatmapMediaType.value === 'image' ? progress.value?.images : progress.value?.videos
  return p?.total ?? 0
})

const healthClass = computed(() => {
  const h = legendStats.value.healthPct
  if (h >= 95) return 'is-good'
  if (h >= 80) return 'is-warn'
  return 'is-bad'
})

const runtimeLabel = computed(() => {
  if (!runtime.value) return '检测中'
  if (!runtime.value.local) return '外部托管'
  if (runtime.value.adoptedExternal) {
    return runtime.value.health?.loaded ? '已有实例 · 就绪' : '已有实例 · 加载中'
  }
  if (runtime.value.waitingForPort) return '等待端口释放'
  if (!runtime.value.running) return '已停止'
  if (runtime.value.health?.loaded) return '就绪'
  return '启动中 / 模型加载中'
})

const runtimeDotClass = computed(() => ({
  'is-ready': runtimeLabel.value === '就绪' || runtimeLabel.value === '已有实例 · 就绪',
  'is-busy': runtimeLabel.value === '启动中 / 模型加载中' || runtimeLabel.value === '已有实例 · 加载中' || runtimeLabel.value === '等待端口释放',
  'is-error': runtimeLabel.value === '已停止'
}))

// ───────────────────────── 工具函数 ─────────────────────────
function formatNumber(n: number | null | undefined): string {
  if (n == null) return '0'
  return n.toLocaleString('en-US')
}

function coverage(s: any): number {
  if (!s?.total) return 0
  return Math.round(((s.total - (s.pending || 0)) / s.total) * 1000) / 10
}

async function refreshCalibration() {
  try { calibration.value = await getEmbeddingCalibration() as any } catch { calibration.value = { enabled: false } }
}

async function refreshRuntime() {
  if (disposed || runtimeRefreshing.value || runtimeLoading.value) return
  const sequence = ++runtimeSequence
  runtimeRefreshing.value = true
  try { const value = await getEmbeddingRuntime() as any; if (!disposed && sequence === runtimeSequence) runtime.value = value }
  catch { if (!disposed && sequence === runtimeSequence) runtime.value = { ...runtime.value, lastError: '无法连接服务，请刷新重试' } }
  finally { runtimeRefreshing.value = false }
}

async function controlRuntime(action: 'start' | 'stop' | 'restart') {
  if (runtimeLoading.value || disposed) return
  if (action !== 'start' && !window.confirm(`${action === 'stop' ? '停止' : '重启'} sidecar 可能中断正在处理的任务，确定继续吗？`)) return
  runtimeLoading.value = true
  runtimeSequence++
  try {
    const fn = action === 'start' ? startEmbeddingRuntime : action === 'stop' ? stopEmbeddingRuntime : restartEmbeddingRuntime
    runtime.value = await fn() as any
    message.success(action === 'start' ? 'sidecar 启动命令已发送' : action === 'stop' ? 'sidecar 已停止' : 'sidecar 重启命令已发送')
    if (!disposed) { if (runtimeRefreshTimeout) clearTimeout(runtimeRefreshTimeout); runtimeRefreshTimeout = setTimeout(() => { if (!document.hidden) void refreshRuntime() }, 1500) }
  } catch (e: any) { message.error('运行时操作失败：' + (e?.message ?? e)); await refreshRuntime() }
  finally { runtimeLoading.value = false }
}

async function recalculate() {
  if (calibrating.value) return
  if (!window.confirm('重算校准会改变后续向量空间，旧向量需要重新嵌入。确定继续吗？')) return
  calibrating.value = true
  try {
    const result: any = await recalculateEmbeddingCalibration()
    if (result?.ok) { message.success('校准完成，请按需重建旧向量'); await refreshCalibration() }
    else message.error(result?.error || '校准失败')
  } catch (e: any) { message.error('校准失败：' + (e?.message ?? e)) }
  finally { calibrating.value = false }
}

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n)
}
function nowText() {
  const d = new Date()
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

/**
 * 根据样本量选择 (cols, cellPx)：
 *   - 每条数据对应一格，左→右、上→下铺
 *   - cellPx ∈ [HEAT_CELL_MIN, HEAT_CELL_MAX]
 *   - 高宽比 ≈ HEAT_ASPECT
 */
function chooseLayout(n: number) {
  if (n <= 0) return { cols: 1, rows: 1, cellPx: HEAT_CELL_MAX }
  const idealCols = Math.max(1, Math.round(Math.sqrt(n / HEAT_ASPECT)))
  const stride = HEAT_CELL_GAP
  let cellPx = Math.round(HEAT_TARGET_W / idealCols) - stride
  cellPx = Math.max(HEAT_CELL_MIN, Math.min(HEAT_CELL_MAX, cellPx))
  const cols = Math.max(1, Math.floor(HEAT_TARGET_W / (cellPx + stride)))
  const rows = Math.max(1, Math.ceil(n / cols))
  return { cols, rows, cellPx }
}

function paintHeatmap() {
  const cv = heatmapCanvasRef.value
  if (!cv) return
  const points = heatmapPoints.value
  const layout = chooseLayout(points.length)
  heatLayout.value = layout
  const { cols, rows, cellPx } = layout
  const stride = cellPx + HEAT_CELL_GAP

  cv.width = cols * stride + HEAT_CELL_GAP
  cv.height = rows * stride + HEAT_CELL_GAP
  const ctx = cv.getContext('2d')
  if (!ctx) return

  // 整张画布灰底（颗粒感来自单元格之间露出的背景色）
  ctx.fillStyle = HEAT_BG
  ctx.fillRect(0, 0, cv.width, cv.height)

  if (points.length === 0) return

  for (let i = 0; i < points.length; i++) {
    const v = points[i].v
    const x = (i % cols) * stride + HEAT_CELL_GAP
    const y = Math.floor(i / cols) * stride + HEAT_CELL_GAP
    ctx.fillStyle = HEAT_COLORS[v] ?? HEAT_COLORS[0]
    ctx.fillRect(x, y, cellPx, cellPx)
  }

  // 选中格子高亮：黑色外描边 + 白色内描边（双层让任何颜色背景都看得清）
  const sel = selectedCell.value
  if (sel && sel.idx < points.length) {
    const sx = (sel.idx % cols) * stride + HEAT_CELL_GAP
    const sy = Math.floor(sel.idx / cols) * stride + HEAT_CELL_GAP
    ctx.lineWidth = 1
    ctx.strokeStyle = '#0f172a'
    ctx.strokeRect(sx - 1.5, sy - 1.5, cellPx + 3, cellPx + 3)
    ctx.strokeStyle = '#ffffff'
    ctx.strokeRect(sx - 0.5, sy - 0.5, cellPx + 1, cellPx + 1)
  }
}

function clearHeatTip() {
  heatTip.value = { ...heatTip.value, show: false }
  hoverInfo.value = ''
}

function onHeatmapMouseMove(e: MouseEvent) {
  const cv = heatmapCanvasRef.value
  const points = heatmapPoints.value
  if (!cv || points.length === 0) {
    clearHeatTip()
    return
  }
  const { cols, cellPx } = heatLayout.value
  const stride = cellPx + HEAT_CELL_GAP
  const rect = cv.getBoundingClientRect()
  const scaleX = cv.width / rect.width
  const scaleY = cv.height / rect.height
  const mx = (e.clientX - rect.left) * scaleX
  const my = (e.clientY - rect.top) * scaleY
  const col = Math.floor((mx - HEAT_CELL_GAP) / stride)
  const row = Math.floor((my - HEAT_CELL_GAP) / stride)
  if (col < 0 || col >= cols || row < 0) {
    clearHeatTip()
    return
  }
  const idx = row * cols + col
  if (idx < 0 || idx >= points.length) {
    clearHeatTip()
    return
  }
  const p = points[idx]
  const tipText = `id=${p.id} · ${TIER_TIPS[p.v]}`
  heatTip.value = {
    show: true,
    x: e.clientX - rect.left + 12,
    y: e.clientY - rect.top + 12,
    text: tipText
  }
  hoverInfo.value = `指向第 ${idx + 1} 格 · ${tipText}`
}

function onTierClick(tier: HeatmapTier) {
  // 点击侧栏色卡时，把下方列表筛选切到对应来源
  sourceFilter.value = tier
  mediaType.value = heatmapMediaType.value
  void nextTick(showList)
}

// ───────────────────────── 格子选中 / 操作 ─────────────────────────
/** 把鼠标坐标解析成"第几个格子"，越界返回 -1 */
function hitTestIdx(e: MouseEvent): number {
  const cv = heatmapCanvasRef.value
  const points = heatmapPoints.value
  if (!cv || points.length === 0) return -1
  const { cols, cellPx } = heatLayout.value
  const stride = cellPx + HEAT_CELL_GAP
  const rect = cv.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) return -1
  const scaleX = cv.width / rect.width
  const scaleY = cv.height / rect.height
  const mx = (e.clientX - rect.left) * scaleX
  const my = (e.clientY - rect.top) * scaleY
  const col = Math.floor((mx - HEAT_CELL_GAP) / stride)
  const row = Math.floor((my - HEAT_CELL_GAP) / stride)
  if (col < 0 || col >= cols || row < 0) return -1
  const idx = row * cols + col
  if (idx < 0 || idx >= points.length) return -1
  return idx
}

function onHeatmapClick(e: MouseEvent) {
  const idx = hitTestIdx(e)
  if (idx < 0) {
    closeSelectedCell()
    return
  }
  const p = heatmapPoints.value[idx]

  // popover 估算尺寸，做边界翻转，避免被 viewport 裁掉
  const POPOVER_W = 280
  const POPOVER_H = 170
  let left = e.clientX + 12
  let top = e.clientY + 12
  if (left + POPOVER_W > window.innerWidth - 8) left = e.clientX - POPOVER_W - 12
  if (top + POPOVER_H > window.innerHeight - 8) top = e.clientY - POPOVER_H - 12
  if (left < 8) left = 8
  if (top < 8) top = 8

  selectedCell.value = { idx, id: p.id, v: p.v, xPx: left, yPx: top }
  clearHeatTip()
  paintHeatmap()
}

function closeSelectedCell() {
  if (!selectedCell.value) return
  selectedCell.value = null
  paintHeatmap()
}

async function onCellRetry() {
  const sel = selectedCell.value
  if (!sel || cellActionLoading.value || batchRetryLoading.value || rowActionKey.value) return
  cellActionLoading.value = true
  try {
    const r: any = await retryEmbedding(heatmapMediaType.value, sel.id)
    const affected = r?.affected ?? 0
    const enqueued = r?.enqueued === true
    if (affected > 0 && enqueued) {
      message.success(`已加入向量处理队列 id=${sel.id}`)
      closeSelectedCell()
      await Promise.all([loadAll(), loadHeatmap()])
    } else if (affected > 0) {
      // reset 成功了但没投出去（多半是缺 url / 视频未转码完成 / MQ 暂时不可达）
      message.warning(`任务未能立即投递 id=${sel.id}（可能缺 URL、视频未转码完成或 MQ 不可达），稍后再点一次“重新嵌入”`)
      await Promise.all([loadAll(), loadHeatmap()])
    } else {
      message.warning('未更新行（id 是否仍存在于库中？）')
    }
  } catch (e: any) {
    message.error('立即重投失败：' + (e?.message ?? e))
  } finally {
    cellActionLoading.value = false
  }
}

async function onCellCopyId() {
  const sel = selectedCell.value
  if (!sel) return
  const text = String(sel.id)
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      // 退化方案：textarea + execCommand
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    message.success(`ID ${text} 已复制`)
  } catch {
    message.warning('复制失败，请手动记下 ID：' + text)
  }
}

function onCellLocateInList() {
  const sel = selectedCell.value
  if (!sel) return
  // 把媒体类型 + 来源筛选都切到画布对应口径
  mediaType.value = heatmapMediaType.value
  sourceFilter.value = sel.v as 0 | 1 | 2
  listKeyword.value = `#${sel.id}`
  searchList()
  closeSelectedCell()
  nextTick(() => {
    const el = document.querySelector('.list-card')
    if (el) (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && selectedCell.value) {
    closeSelectedCell()
  }
}

function onDocClick(e: MouseEvent) {
  if (!selectedCell.value) return
  const target = e.target as HTMLElement | null
  if (!target) return
  // 点击 popover 内部不关闭
  if (target.closest('.cell-popover')) return
  // 点击 canvas 由 onHeatmapClick 自己处理（选中其他格子或清空）
  if (target.closest('.scanner-canvas')) return
  closeSelectedCell()
}

function onWrapScroll() {
  // popover 是 fixed 定位，画布滚动后 popover 不会跟随选中格子，
  // 所以一旦发生滚动就直接关闭，避免视觉错位
  if (selectedCell.value) closeSelectedCell()
}

function onMediaChange() {
  // 切换媒体库时，列表媒体也同步，避免上下视图割裂
  mediaType.value = heatmapMediaType.value
  heatmapPoints.value = []
  heatmapTotal.value = 0
  clearHeatTip()
  loadHeatmap()
}

// ───────────────────────── 数据加载 ─────────────────────────
async function loadHeatmap() {
  if (disposed) return
  const sequence = ++heatmapSequence
  // 重新加载会改变 cells 的索引顺序，旧的 selectedCell.idx 不再可信，先清空
  selectedCell.value = null
  heatmapLoading.value = true
  try {
    const r = await getEmbeddingHeatmap(heatmapMediaType.value, heatmapLimit.value)
    if (disposed || sequence !== heatmapSequence) return
    const data: any = r as any
    heatmapPoints.value = (data.cells ?? []) as HeatmapPoint[]
    heatmapTotal.value = (data.totalEligible ?? 0) as number
    heatmapReturned.value = (data.returned ?? heatmapPoints.value.length) as number
    lastRefreshAt.value = nowText()
    await nextTick()
    paintHeatmap()
  } catch (e: any) {
    if (!disposed && sequence === heatmapSequence) dataError.value = '分布图暂时无法刷新，已保留上次结果。' + (e?.message ?? '')
  } finally {
    if (sequence === heatmapSequence) heatmapLoading.value = false
  }
}

async function loadAll() {
  if (loading.value || disposed) return
  loading.value = true
  try {
    const [p, s, o] = await Promise.all([getEmbeddingProgress(), getEmbeddingSourceStats(), getEmbeddingOverview()])
    if (disposed) return
    progress.value = p as any
    stats.value = s as any
    overview.value = o as any
  } catch (e: any) {
    if (!disposed) dataError.value = '统计暂时无法刷新，已保留上次结果。' + (e?.message ?? '')
  } finally {
    loading.value = false
  }
}

async function retryCurrentBatch() {
  if (!checkedIds.value.length || batchRetryLoading.value || rowActionKey.value || cellActionLoading.value || listLoading.value) return
  const ids = rows.value.filter(row => checkedIds.value.includes(row.id)).map(row => row.id)
  const type = mediaType.value
  if (!await confirmAction('重新嵌入所选媒体', `将为所选 ${ids.length} 个媒体在最近登记的模型空间中重新生成向量。任务进度可在「处理进度」中查看，历史覆盖记录不会随新任务更新。`)) return
  batchRetryLoading.value = true
  try {
    const result: any = await retryEmbeddingBatch(type, ids)
    const report = `已接受 ${result?.accepted ?? 0} 条，已入队 ${result?.enqueued ?? 0} 条，失败 ${result?.failed ?? 0} 条`
    if (result?.failed) message.warning(report); else message.success(report)
    checkedIds.value = []
    await Promise.all([loadAll(), loadList(), loadHeatmap()])
  } catch (e: any) { message.error('批量重试失败：' + (e?.message ?? e)) }
  finally { batchRetryLoading.value = false }
}

async function loadList() {
  if (disposed) return
  clearTimeout(searchTimer)
  const sequence = ++listSequence
  listLoading.value = true
  checkedIds.value = []
  rows.value = []
  try {
    const result = await listEmbeddingPage(mediaType.value, sourceFilter.value, listPage.value, listPageSize.value, listKeyword.value.trim())
    if (disposed || sequence !== listSequence) return
    listTotal.value = result.total
    const lastPage = Math.max(1, Math.ceil(result.total / listPageSize.value))
    if (listPage.value > lastPage) { listPage.value = lastPage; await loadList(); return }
    rows.value = result.rows
    listError.value = ''
  } catch (e: any) {
    if (!disposed && sequence === listSequence) { rows.value = []; listTotal.value = 0; listError.value = '读取清单失败，请重新查询。' + (e?.message ?? '') }
  } finally {
    if (sequence === listSequence) listLoading.value = false
  }
}

async function onRetry(row: EmbeddingAdminRow) {
  if (listLoading.value || rowActionKey.value || batchRetryLoading.value || cellActionLoading.value) return
  rowActionKey.value = `retry:${row.id}`
  try {
    const r: any = await retryEmbedding(mediaType.value, row.id)
    const affected = r?.affected ?? 0
    const enqueued = r?.enqueued === true
    if (affected > 0 && enqueued) {
      message.success('已加入向量处理队列')
      await Promise.all([loadAll(), loadList(), loadHeatmap()])
    } else if (affected > 0) {
      message.warning('任务未能立即投递（可能缺 url / 视频未转码完成）')
      await Promise.all([loadAll(), loadList(), loadHeatmap()])
    } else {
      message.warning('未更新行（检查 id 是否存在）')
    }
  } catch (e: any) {
    message.error('重试失败：' + (e?.message ?? e))
  } finally { rowActionKey.value = '' }
}

async function onRetranscode(row: EmbeddingAdminRow) {
  if (listLoading.value || rowActionKey.value || batchRetryLoading.value || cellActionLoading.value) return
  if (!await confirmAction('重新转码视频', `将为「${rowTitle(row)}」重新生成视频版本并重置向量。这可能需要较长时间。`)) return
  rowActionKey.value = `transcode:${row.id}`
  try {
    const res: any = await retranscodeVideo(row.hash)
    if (res?.ok) {
      message.success('已触发重转码')
      await Promise.all([loadAll(), loadList(), loadHeatmap()])
    } else {
      message.error(res?.error ?? '重转码失败')
    }
  } catch (e: any) {
    const detail = e?.response?.data?.error ?? e?.message ?? e
    message.error('重转码失败：' + detail)
  } finally { rowActionKey.value = '' }
}

function rowTitle(row: EmbeddingAdminRow): string {
  return row.title?.trim() || row.fileName?.trim() || `${mediaType.value === 'video' ? '视频' : '图片'} #${row.id}`
}

function openMedia(row: EmbeddingAdminRow) {
  if (!row.uuid) {
    message.warning('该媒体没有详情页标识（UUID）')
    return
  }
  const origin = getPublicSiteOrigin()
  const kind = mediaType.value === 'video' ? 'video' : 'image'
  window.open(`${origin}/${kind}/${encodeURIComponent(row.uuid)}`, '_blank', 'noopener,noreferrer')
}

function previewUrl(row: EmbeddingAdminRow): string {
  return row.previewUrl ?? ''
}

function onPreviewError(event: Event) {
  const image = event.currentTarget as HTMLImageElement | null
  if (!image) return
  image.style.display = 'none'
  const fallback = document.createElement('span')
  fallback.className = 'media-thumb-placeholder'
  fallback.textContent = '暂无预览'
  image.parentElement?.appendChild(fallback)
}

async function onLocateTask(task: { mediaType: 'image' | 'video'; mediaId: number }) {
  if (listBusy.value) return
  const sequence = ++locateSequence
  try {
    const pages = await Promise.all(([0, 1, 2] as const).map(source =>
      listEmbeddingPage(task.mediaType, source, 1, 1, `#${task.mediaId}`)))
    if (disposed || sequence !== locateSequence) return
    const source = pages.findIndex(page => page.rows.some(row => row.id === task.mediaId))
    if (source < 0) { message.info('该媒体已删除或尚未处理完成，暂不在历史嵌入清单中'); return }
    mediaType.value = task.mediaType
    sourceFilter.value = source as HeatmapTier
    listKeyword.value = `#${task.mediaId}`
    await nextTick()
    searchList()
    document.querySelector('.list-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  } catch (e: any) {
    if (!disposed && sequence === locateSequence) message.error('定位失败，请稍后重试：' + (e?.message ?? e))
  }
}

const columns = computed<DataTableColumns<EmbeddingAdminRow>>(() => [
  { type: 'selection', disabled: () => listBusy.value || listLoading.value },
  {
    title: '媒体',
    key: 'media',
    minWidth: 290,
    render: (row) => h('div', { class: 'media-cell' }, [
      h('button', {
        class: 'media-thumb-button',
        type: 'button',
        title: '预览与嵌入详情',
        onClick: () => showMedia(row)
      }, [row.previewUrl
        ? h('img', {
          class: 'media-thumb',
          src: previewUrl(row),
          alt: rowTitle(row),
          loading: 'lazy',
          onError: (event: Event) => onPreviewError(event)
        })
        : h('span', { class: 'media-thumb-placeholder' }, mediaType.value === 'video' ? '视频' : '图片')]),
      h('div', { class: 'media-copy' }, [
        h('button', { class: 'media-title', type: 'button', title: rowTitle(row), onClick: () => showMedia(row) }, rowTitle(row)),
        h('div', { class: 'media-meta' }, [
          `${mediaType.value === 'video' ? '视频' : '图片'} · ID ${row.id}`,
          row.hash ? ` · ${row.hash.slice(0, 12)}` : ''
        ])
      ])
    ])
  },
  {
    title: '处理结果',
    key: 'embeddingSource',
    width: 110,
    render: (r) => h(NTag, { size: 'small', round: true, bordered: false, type: (r.embeddingSource ?? sourceFilter.value) === 2 ? 'warning' : (r.embeddingSource ?? sourceFilter.value) === 1 ? 'info' : 'success' }, { default: () => TIER_LABELS[(r.embeddingSource ?? sourceFilter.value) as HeatmapTier] })
  },
  {
    title: '失败次数',
    key: 'embeddingAttempts',
    width: 88,
    render: (r) => String(r.embeddingAttempts ?? 0)
  },
  {
    title: '操作',
    key: 'actions',
    width: 200,
    render: (row) => {
      const btns = [
        h(
          NButton,
          { size: 'small', type: 'primary', secondary: true, loading: rowActionKey.value === `retry:${row.id}`, disabled: listLoading.value || batchRetryLoading.value || cellActionLoading.value || (!!rowActionKey.value && rowActionKey.value !== `retry:${row.id}`), onClick: () => onRetry(row) },
          { default: () => '重新嵌入' }
        )
      ]
      btns.push(h(NDropdown, {
        trigger: 'click', options: [
          { label: '预览与详情', key: 'preview' }, { label: '复制 Hash', key: 'copy' },
          ...(row.uuid ? [{ label: '打开媒体页面 ↗', key: 'open' }] : []),
          ...(mediaType.value === 'video' ? [{ label: '重新转码…', key: 'transcode', disabled: listBusy.value }] : [])
        ], onSelect: (key: string) => {
          if (key === 'preview') showMedia(row)
          if (key === 'copy') void copyHash(row)
          if (key === 'open') openMedia(row)
          if (key === 'transcode') void onRetranscode(row)
        }
      }, { default: () => h(NButton, { size: 'small', quaternary: true, 'aria-label': `更多操作：${rowTitle(row)}` }, { default: () => '更多 ···' }) }))
      return h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, btns)
    }
  }
])

// ───────────────────────── 自动刷新 ─────────────────────────
function startAutoRefresh() {
  stopAutoRefresh()
  if (!autoRefresh.value) return
  const ms = Math.max(10, autoRefreshSec.value || 60) * 1000
  autoRefreshTimer = setInterval(() => {
    if (!document.hidden && !loading.value && !heatmapLoading.value) void refreshStatsAndHeatmap()
  }, ms)
}
function stopAutoRefresh() {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer)
    autoRefreshTimer = null
  }
}
function onAutoRefreshChange() {
  startAutoRefresh()
}

watch(autoRefreshSec, () => {
  if (autoRefresh.value) startAutoRefresh()
})

watch([mediaType, sourceFilter], () => {
  locateSequence++
  rows.value = []
  listTotal.value = 0
  listPage.value = 1
  checkedIds.value = []
  detailVisible.value = false
  clearTimeout(searchTimer)
  void loadList()
})

watch(listKeyword, () => {
  locateSequence++
  listSequence++
  rows.value = []
  checkedIds.value = []
  listLoading.value = true
  clearTimeout(searchTimer)
  searchTimer = setTimeout(searchList, 350)
})

// ───────────────────────── 入口 ─────────────────────────
async function refreshStatsAndHeatmap() {
  if (disposed || loading.value || heatmapLoading.value) return
  dataError.value = ''
  await Promise.all([loadAll(), loadHeatmap()])
}

function showList() {
  void loadList()
  document.querySelector('.list-card')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('mousedown', onDocClick)
  void refreshStatsAndHeatmap()
  void refreshRuntime()
  runtimeTimer = setInterval(() => { if (!document.hidden) void refreshRuntime() }, 5000)
  void refreshCalibration()
  void loadList()
})

onBeforeUnmount(() => {
  disposed = true
  clearTimeout(searchTimer)
  heatmapSequence++
  listSequence++
  runtimeSequence++
  if (runtimeRefreshTimeout) clearTimeout(runtimeRefreshTimeout)
  if (runtimeTimer) {
    clearInterval(runtimeTimer)
    runtimeTimer = null
  }
  stopAutoRefresh()
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('mousedown', onDocClick)
})
</script>

<style scoped>
.inventory-heading { display:flex; align-items:center; justify-content:space-between; gap:20px; padding:24px; }
.inventory-heading h2 { font-size:18px; margin:0 0 6px; }.inventory-heading p { margin:0; color:var(--n-text-color-3); font-size:13px; }
.inventory-states { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; padding:0 24px 20px; }
.inventory-state { text-align:left; background:var(--n-card-color); border:1px solid var(--n-divider-color); border-radius:12px; padding:16px 18px; color:inherit; font:inherit; cursor:pointer; }
.inventory-state.active { border-color:var(--admin-accent,#2f7b5b); background:var(--admin-accent-soft,#e6f3e9); box-shadow:inset 0 0 0 1px var(--admin-accent,#2f7b5b); }
.inventory-state span { display:flex; align-items:center; gap:8px; font-size:13px; }.inventory-state i { width:7px; height:7px; border-radius:50%; }.inventory-state strong { display:block; font-size:26px; margin:8px 0 2px; font-variant-numeric:tabular-nums; }.inventory-state small { color:var(--n-text-color-3); }
.inventory-state:focus-visible { outline:2px solid var(--admin-accent,#2f7b5b); outline-offset:3px; }
.inventory-toolbar,.inventory-selection,.inventory-footer { display:flex; align-items:center; flex-wrap:wrap; gap:12px; padding:16px 24px; border-top:1px solid var(--n-divider-color); }.inventory-toolbar .n-input { max-width:380px; }.inventory-total { flex:1; color:var(--n-text-color-3); font-size:12px; }.inventory-selection { background:var(--admin-accent-soft,#e6f3e9); }.inventory-footer { justify-content:space-between; }.inventory-footer>span { color:var(--n-text-color-3); font-size:12px; }
.inventory-error { margin:0 24px 16px; }.inventory-table :deep(.n-data-table-td) { padding-top:16px; padding-bottom:16px; }.inventory-help { padding:16px 24px; border-top:1px solid var(--n-divider-color); color:var(--n-text-color-3); font-size:12px; }.inventory-help summary { cursor:pointer; }.inventory-help p { line-height:1.8; }.inventory-preview { min-height:180px; display:grid; place-items:center; background:var(--admin-bg,#f5f9f5); border-radius:12px; padding:16px; }.inventory-preview :deep(img) { max-width:100%; max-height:300px; }.inventory-detail-title,.inventory-hash { overflow-wrap:anywhere; }.inventory-hash { display:block; font-family:monospace; }
@media(max-width:700px) { .inventory-heading { align-items:flex-start; flex-direction:column; padding:18px; }.inventory-states { padding:0 18px 18px; gap:8px; }.inventory-state { padding:12px 10px; }.inventory-state small { display:none; }.inventory-state strong { font-size:22px; }.inventory-toolbar,.inventory-footer,.inventory-selection { padding:14px 18px; }.inventory-toolbar .n-input { max-width:none; width:100%; }.inventory-footer :deep(.n-pagination) { flex-wrap:wrap; } }

/* ===========================================================
   整体页面 & 「窗口」外壳
   ========================================================== */
.scanner-app {
  padding: 28px 32px 48px;
  max-width: 1480px;
  margin: 0 auto;
}

.scanner-window {
  border: 1px solid var(--n-divider-color);
  border-radius: 14px;
  background: var(--n-card-color);
  box-shadow: 0 4px 16px rgba(41, 74, 48, 0.03);
  overflow: hidden;
  margin-bottom: 16px;
}

/* ===========================================================
   标题栏（窗口顶部条）
   ========================================================== */
.window-titlebar {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 56px;
  padding: 0 20px;
  background: var(--n-card-color);
  border-bottom: 1px solid var(--n-divider-color);
  font-size: 15px;
  color: #2a2a2a;
  user-select: none;
}
.title-icon {
  font-size: 14px;
  color: #5a5a5a;
}
.title-text {
  font-weight: 600;
  letter-spacing: 0.3px;
}
.title-sep {
  color: #888;
}
.title-sub {
  color: #4a4a4a;
}
.title-spacer {
  flex: 1;
}
.title-stat {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  color: #1a1a1a;
}
.title-stat strong {
  color: var(--admin-accent, #2f7b5b);
  font-weight: 600;
}

/* ===========================================================
   工具栏（紧凑米色背景）
   ========================================================== */
.window-toolbar {
  padding: 14px 20px;
  background: var(--admin-bg, #f5f9f5);
  border-bottom: 1px solid var(--n-divider-color);
}

.overview-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(100px, 1fr)) minmax(230px, 2fr);
  gap: 1px;
  background: var(--n-divider-color);
  border-bottom: 1px solid var(--n-divider-color);
}
.runtime-strip {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 56px;
  padding: 12px 20px;
  background: var(--n-card-color);
  color: var(--n-text-color-2);
  border: 1px solid var(--n-divider-color);
  border-radius: 14px;
  margin-bottom: 20px;
  font-size: 12px;
}
.runtime-title, .runtime-meta, .runtime-actions { display: flex; align-items: center; gap: 8px; }
.runtime-title strong { color: var(--n-text-color); }
.runtime-title code { color: #9ca3af; font-family: ui-monospace, monospace; }
.runtime-meta { flex: 1; color: #9ca3af; min-width: 0; }
.runtime-error { color: #c33d55; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.runtime-dot { width: 8px; height: 8px; border-radius: 50%; background: #6b7280; }
.runtime-dot.is-ready { background: #22c55e; }
.runtime-dot.is-busy { background: #f59e0b; animation: runtime-pulse 1.4s ease-in-out infinite; }
.runtime-dot.is-error { background: #ef4444; }
@keyframes runtime-pulse { 50% { opacity: .45; } }
@media (max-width: 700px) {
  .runtime-strip { flex-wrap: wrap; }
  .runtime-meta { flex-basis: 100%; order: 3; }
}
.overview-item, .overview-model {
  min-height: 76px;
  padding: 15px 18px;
  background: #fff;
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.overview-item { flex-wrap: wrap; }
.overview-k { color: #6b7280; font-size: 11px; width: 100%; }
.overview-item strong { font-size: 20px; line-height: 1; color: #15803d; font-family: ui-monospace, monospace; }
.overview-item strong.is-blue { color: var(--admin-accent, #2f7b5b); }
.overview-item strong.is-red { color: #dc2626; }
.overview-item small { color: #6b7280; font-size: 11px; }
.overview-model { align-items: center; flex-wrap: wrap; color: #4b5563; font-size: 12px; }
.model-name { max-width: 190px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: ui-monospace, monospace; color: #374151; }
@media (max-width: 900px) {
  .overview-strip { grid-template-columns: repeat(2, minmax(140px, 1fr)); }
  .overview-model { grid-column: 1 / -1; }
}
.tb-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.tb-label {
  font-size: 12px;
  color: #4a4a4a;
  font-weight: 500;
}
.tb-divider {
  width: 1px;
  height: 16px;
  background: #d4cfb8;
  margin: 0 4px;
}
.tb-arrow {
  color: #9a9a9a;
  font-size: 12px;
}
.tb-value {
  font-family: ui-monospace, monospace;
  font-size: 12px;
  color: #1a1a1a;
  min-width: 64px;
  padding: 2px 8px;
  background: #fff;
  border: 1px solid #d8d2bc;
  border-radius: 3px;
}
.tb-hint {
  font-size: 11px;
  color: #8a8a8a;
}

/* ===========================================================
   状态栏（"扫描状态: 正在分析..."）
   ========================================================== */
.window-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background: #fff;
  border-bottom: 1px solid #e0e0e0;
  font-size: 12px;
  min-height: 28px;
}
.status-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 4px rgba(34, 197, 94, 0.7);
  flex-shrink: 0;
}
.status-dot.is-busy {
  background: #fbbf24;
  box-shadow: 0 0 4px rgba(251, 191, 36, 0.85);
  animation: dot-pulse 1.1s ease-in-out infinite;
}
@keyframes dot-pulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.45; }
}
.status-label {
  color: #4a4a4a;
  font-weight: 500;
}
.status-sep {
  color: #b0b0b0;
}
.status-main {
  flex: 1;
  color: #1a1a1a;
  font-family: ui-monospace, monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.status-time {
  color: #8a8a8a;
  margin-left: 6px;
}
.status-detail {
  color: var(--admin-accent, #2f7b5b);
  cursor: pointer;
  font-size: 12px;
  white-space: nowrap;
}
.status-detail:hover {
  text-decoration: underline;
}

/* ===========================================================
   主体区：画布 + 右侧色卡侧栏
   ========================================================== */
.window-main {
  display: flex;
  align-items: stretch;
  gap: 0;
  background: #ececec;
  padding: 8px;
  border-bottom: 1px solid #d8d8d8;
}

.canvas-frame {
  position: relative;
  flex: 1;
  min-width: 320px;
  background: #f5f5f5;
  border: 1px solid #d0d0d0;
  border-radius: 2px;
  padding: 0;
  overflow: auto;
  max-height: 64vh;
  min-height: 320px;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.05);
}
.scanner-canvas {
  display: block;
  margin: 0 auto;
  max-width: 100%;
  height: auto;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  cursor: pointer;
}
.canvas-empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #888;
  pointer-events: none;
  text-align: center;
}
.empty-title {
  font-size: 14px;
  color: #555;
  font-weight: 500;
  margin-bottom: 4px;
}
.empty-sub {
  font-size: 12px;
  color: #888;
}

.heat-tip {
  position: absolute;
  pointer-events: none;
  z-index: 4;
  font-size: 11px;
  padding: 5px 9px;
  background: rgba(20, 20, 20, 0.92);
  color: #fff;
  border-radius: 3px;
  white-space: nowrap;
  font-family: ui-monospace, monospace;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
}

/* ===========================================================
   单元格选中后的操作 Popover（fixed 定位，跟随鼠标点击坐标）
   ========================================================== */
.cell-popover {
  position: fixed;
  z-index: 999;
  width: 280px;
  background: #fff;
  border: 1px solid var(--n-divider-color);
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(41, 74, 48, 0.18);
  animation: pop-in .15s ease-out;
  font-size: 12px;
  overflow: hidden;
  user-select: none;
}
.cp-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: var(--admin-hover, #f0f7ef);
  border-bottom: 1px solid var(--n-divider-color);
}
.cp-swatch {
  width: 14px;
  height: 14px;
  border-radius: 2px;
  border: 1px solid rgba(0, 0, 0, 0.18);
  flex-shrink: 0;
}
.cp-id {
  font-family: ui-monospace, monospace;
  font-weight: 600;
  color: #1a1a1a;
}
.cp-tier {
  color: #4a4a4a;
  font-size: 11.5px;
  background: #fff;
  padding: 1px 6px;
  border-radius: 9px;
  border: 1px solid #d4cfb8;
}
.cp-spacer {
  flex: 1;
}
.cp-close {
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 14px;
  color: #6a6a6a;
  padding: 0 4px;
  line-height: 1;
}
.cp-close:hover {
  color: #1a1a1a;
}
.cp-body {
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: #fff;
}
.cp-tip {
  color: #4a4a4a;
  font-size: 11.5px;
  line-height: 1.5;
}
.cp-meta {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 11px;
  color: #8a8a8a;
  font-family: ui-monospace, monospace;
}
.cp-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

/* 右侧色卡侧栏 */
.status-sidebar {
  width: 168px;
  flex-shrink: 0;
  background: var(--admin-bg, #f5f9f5);
  border: 1px solid var(--n-divider-color);
  border-left: none;
  padding: 12px;
  font-size: 12px;
  display: flex;
  flex-direction: column;
}
.sb-row {
  display: grid;
  grid-template-columns: 1fr 14px auto;
  align-items: center;
  gap: 8px;
  padding: 10px 4px;
  border-radius: 8px;
  cursor: pointer;
  border-bottom: 1px dashed transparent;
  transition: background 0.12s;
}
.sb-row:hover {
  background: var(--admin-accent-soft, #e6f3e9);
}
.sb-row.is-zero {
  opacity: 0.55;
}
.sb-label {
  color: #2a2a2a;
  font-weight: 500;
}
.sb-swatch {
  width: 14px;
  height: 14px;
  border-radius: 2px;
  border: 1px solid rgba(0, 0, 0, 0.18);
  box-shadow: inset 0 -1px 0 rgba(0, 0, 0, 0.08);
}
.sb-count {
  font-family: ui-monospace, monospace;
  text-align: right;
  font-weight: 600;
  color: #1a1a1a;
  min-width: 48px;
}
.sb-divider {
  height: 1px;
  background: #d8d8d8;
  margin: 6px -10px;
}
.sb-summary {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 2px;
}
.sb-sum-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 6px;
  align-items: baseline;
  font-size: 11.5px;
  color: #4a4a4a;
}
.sb-sum-row strong {
  font-family: ui-monospace, monospace;
  text-align: right;
  color: #1a1a1a;
  font-weight: 600;
}
.sb-pct {
  color: #6a6a6a;
  font-size: 11px;
  font-family: ui-monospace, monospace;
}

/* ===========================================================
   信息行（"已嵌入 / 总数 ..."）
   ========================================================== */
.window-info {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  padding: 12px 20px;
  background: var(--admin-bg, #f5f9f5);
  border-bottom: 1px solid #e0e0e0;
  font-size: 11.5px;
  color: #4a4a4a;
}
.info-item {
  display: flex;
  gap: 4px;
  align-items: baseline;
}
.info-key {
  color: #6a6a6a;
}
.info-val {
  font-family: ui-monospace, monospace;
  color: #1a1a1a;
  font-weight: 500;
}
.info-warn {
  color: #b45309;
}
.info-warn .info-key,
.info-warn .info-val {
  color: #b45309;
}

/* ===========================================================
   底部按钮栏
   ========================================================== */
.window-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 20px;
  background: var(--n-card-color);
  flex-wrap: wrap;
}
.actions-divider {
  width: 1px;
  height: 22px;
  background: #c8c4b0;
  margin: 0 2px;
}
.actions-spacer {
  flex: 1;
}
.metrics-box {
  display: flex;
  gap: 12px;
  padding: 4px 10px;
  background: #eef6f2;
  color: #267354;
  border: 1px solid #d7e9df;
  border-radius: 8px;
  font-family: ui-monospace, monospace;
  font-size: 11.5px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
}
.m-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.m-key {
  color: #56836e;
  font-size: 11px;
}
.m-val {
  color: #267354;
  font-weight: 600;
}
.m-val.is-good {
  color: #267354;
}
.m-val.is-warn {
  color: #a76e09;
}
.m-val.is-bad {
  color: #c33d55;
}

/* ===========================================================
   下方明细列表卡
   ========================================================== */
.list-card {
  margin-top: 8px;
}
:deep(.media-cell) {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
:deep(.media-thumb-button) {
  flex: 0 0 auto;
  width: 76px;
  height: 56px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  overflow: hidden;
  cursor: pointer;
  background: #eef0f3;
}
:deep(.media-thumb) {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
:deep(.media-thumb-placeholder) {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: #7b8491;
  font-size: 9px;
  font-weight: 700;
}
:deep(.media-copy) {
  min-width: 0;
}
:deep(.media-title) {
  display: block;
  max-width: 100%;
  padding: 0;
  overflow: hidden;
  border: 0;
  background: transparent;
  color: #222;
  cursor: pointer;
  font: inherit;
  font-weight: 600;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}
:deep(.media-title:hover) {
  color: #2f7d4a;
  text-decoration: underline;
}
:deep(.media-meta) {
  margin-top: 3px;
  overflow: hidden;
  color: #7a7a7a;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.table-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 24px 12px;
  color: #6b7280;
  text-align: center;
}
.table-empty strong {
  color: #374151;
  font-size: 13px;
}
.table-empty span {
  font-size: 12px;
}
.label {
  font-size: 13px;
  color: #555;
}
.explain {
  margin: 0;
  padding-left: 8px;
  line-height: 1.85;
  font-size: 13px;
  list-style: none;
}
.explain li {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dot {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 2px;
  border: 1px solid rgba(0, 0, 0, 0.2);
  flex-shrink: 0;
}
.embedding-heading { display: flex; justify-content: space-between; align-items: center; gap: 20px; margin-bottom: 24px; }
.list-card :deep(.n-radio-group) { display: flex; flex-wrap: wrap; gap: 4px; max-width: 100%; }
.embedding-eyebrow { color: var(--n-text-color-3); font-size: 11px; font-weight: 700; letter-spacing: 1.4px; }.embedding-heading h1 { font-size: 26px; margin: 7px 0 8px; }.embedding-heading p { margin: 0; color: var(--n-text-color-3); font-size: 13px; }.embedding-error { margin-bottom: 20px; }
.list-card { scroll-margin-top: 24px; border-radius: 14px; }.list-search { display: flex; align-items: center; gap: 16px; margin: 18px 0; }.list-search .n-input { max-width: 340px; }.list-search span { color: var(--n-text-color-3); font-size: 12px; }.status-main { min-width: 0; }.status-detail { margin: 0; }.runtime-title { flex-wrap: wrap; }.sb-row:focus-visible,.cp-close:focus-visible { outline: 2px solid var(--admin-accent, #2f7b5b); outline-offset: 2px; }
@keyframes pop-in { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
@media(max-width:1100px) { .overview-strip { grid-template-columns: repeat(4,minmax(0,1fr)); }.overview-model { grid-column: 1 / -1; } }
@media(max-width:700px) { .scanner-app { padding: 20px 16px 40px; }.embedding-heading { flex-direction: column; align-items: flex-start; }.window-titlebar { flex-wrap: wrap; padding: 12px 16px; }.title-spacer { display: none; }.title-stat { width: 100%; }.overview-strip { grid-template-columns: repeat(2,minmax(0,1fr)); }.overview-item { padding: 14px; }.window-main { flex-direction: column; }.status-sidebar { width: auto; border-left: 1px solid var(--n-divider-color); }.canvas-frame { width: 100%; box-sizing: border-box; }.list-search { flex-direction: column; align-items: flex-start; }.list-search .n-input { max-width: none; }.explain li { display: block; }.explain .dot { margin-right: 6px; }.runtime-strip { padding: 14px; }.runtime-title { flex-wrap: wrap; }.window-toolbar,.window-info,.window-actions { padding-left: 14px; padding-right: 14px; } }
@media(prefers-reduced-motion:reduce) { .cell-popover,.runtime-dot.is-busy,.status-dot.is-busy { animation: none; }.sb-row { transition: none; } }
</style>
