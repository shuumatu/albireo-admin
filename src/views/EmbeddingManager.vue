<template>
  <div class="scanner-app">
    <!-- =======================  扫描器主窗口  ======================= -->
    <div class="scanner-window">
      <!-- 标题栏 -->
      <div class="window-titlebar">
        <span class="title-icon">▦</span>
        <span class="title-text">向量嵌入状态视图</span>
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

      <!-- 状态栏 -->
      <div class="window-status">
        <span class="status-dot" :class="{ 'is-busy': heatmapLoading }"></span>
        <span class="status-label">嵌入状态</span>
        <span class="status-sep">:</span>
        <span class="status-main">
          <template v-if="heatmapLoading">正在加载嵌入数据…</template>
          <template v-else-if="hoverInfo">{{ hoverInfo }}</template>
          <template v-else-if="heatmapPoints.length > 0">
            就绪 · 共 {{ formatNumber(heatmapPoints.length) }} 个样本
            <span v-if="lastRefreshAt" class="status-time">· 最近刷新 {{ lastRefreshAt }}</span>
          </template>
          <template v-else>等待加载数据…</template>
        </span>
        <a class="status-detail" @click="loadList">查看明细 ▸</a>
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
            <div class="empty-sub">点击下方 [刷新数据] 加载嵌入状态</div>
          </div>
        </div>

        <!-- 3 档状态色卡（标签 → 色块 → 计数） -->
        <div class="status-sidebar">
          <div
            v-for="row in tierRows"
            :key="row.key"
            class="sb-row"
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
          刷新数据
        </n-button>
        <n-button size="small" @click="loadHeatmap" :loading="heatmapLoading">
          仅刷新画布
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
            title="清空向量并立即向 sidecar 投递一条嵌入任务（不再依赖定时回填）"
            @click="onCellRetry"
          >
            立即重新嵌入
          </n-button>
          <n-button size="tiny" @click="onCellCopyId">复制 ID</n-button>
          <n-button size="tiny" @click="onCellLocateInList">在明细中查看</n-button>
        </div>
      </div>
    </div>

    <!-- =====================  问题样本明细列表  ===================== -->
    <n-card title="问题样本明细" class="list-card" size="small">
      <n-flex :size="12" wrap align="center" style="margin-bottom: 12px">
        <span class="label">媒体类型</span>
        <n-radio-group v-model:value="mediaType" size="small">
          <n-radio-button value="image">图片</n-radio-button>
          <n-radio-button value="video">视频</n-radio-button>
        </n-radio-group>
        <span class="label">来源筛选</span>
        <n-radio-group v-model:value="sourceFilter" size="small">
          <n-radio-button :value="0">0 主路径</n-radio-button>
          <n-radio-button :value="1">1 封面兜底</n-radio-button>
          <n-radio-button :value="2">2 未嵌入</n-radio-button>
        </n-radio-group>
        <n-button size="small" @click="loadList" :loading="listLoading">查询</n-button>
      </n-flex>

      <n-data-table
        :columns="columns"
        :data="rows"
        :loading="listLoading"
        :pagination="false"
        size="small"
        :scroll-x="720"
      />

      <n-alert type="info" title="色卡说明（与画布一致）" style="margin-top: 14px">
        <ul class="explain">
          <li><span class="dot" :style="{ background: HEAT_COLORS[0] }"></span><strong>主路径</strong>：embedding 已写入（embedding_source = 0）</li>
          <li><span class="dot" :style="{ background: HEAT_COLORS[1] }"></span><strong>封面兜底</strong>：embedding 已写入（embedding_source = 1，检索质量略弱）</li>
          <li><span class="dot" :style="{ background: HEAT_COLORS[2] }"></span><strong>待嵌入</strong>：尚无向量。本系统已停用定时回填，请在画布上点击格子「立即重新嵌入」或本表行内「重试」按钮手动触发；<code>embedding_attempts</code> 反映已失败次数</li>
        </ul>
      </n-alert>
    </n-card>

    <!-- 右下悬浮：实时处理面板（自带 2s 轮询，无任务时自动隐藏，组件内 Teleport 到 body） -->
    <EmbeddingInFlightPanel />
  </div>
</template>

<script setup lang="ts">
import { computed, h, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { DataTableColumns } from 'naive-ui'
import { NButton, useMessage } from 'naive-ui'
import {
  getEmbeddingHeatmap,
  getEmbeddingProgress,
  getEmbeddingSourceStats,
  listEmbeddingRows,
  retryEmbedding,
  retranscodeVideo,
  type EmbeddingAdminRow,
  type EmbeddingProgressEnvelope,
  type EmbeddingSourceStatsEnvelope,
  type HeatmapTier
} from '../api/embedding'
import EmbeddingInFlightPanel from '../components/EmbeddingInFlightPanel.vue'

const message = useMessage()

// ───────────────────────── 视觉常量 ─────────────────────────
// 3 档色卡：绿（主路径）/ 黄（兜底）/ 红（待嵌入）
const HEAT_COLORS = [
  '#22c55e', // 0 主路径已嵌入
  '#f5b800', // 1 封面兜底已嵌入
  '#ef4444'  // 2 待嵌入
] as const

const TIER_LABELS: Record<HeatmapTier, string> = {
  0: '主路径',
  1: '封面兜底',
  2: '待嵌入'
}

const TIER_TIPS: Record<HeatmapTier, string> = {
  0: '主路径已嵌入（embedding_source=0）',
  1: '封面兜底已嵌入（embedding_source=1，检索质量略弱）',
  2: '待嵌入，等待回填'
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
const rows = ref<EmbeddingAdminRow[]>([])
const mediaType = ref<'image' | 'video'>('video')
const heatmapMediaType = ref<'image' | 'video'>('video')
const sourceFilter = ref<0 | 1 | 2>(2)

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

// ───────────────────────── 工具函数 ─────────────────────────
function formatNumber(n: number | null | undefined): string {
  if (n == null) return '0'
  return n.toLocaleString('en-US')
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
  loadList()
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
  if (!sel) return
  cellActionLoading.value = true
  try {
    const r: any = await retryEmbedding(heatmapMediaType.value, sel.id)
    const affected = r?.affected ?? 0
    const enqueued = r?.enqueued === true
    if (affected > 0 && enqueued) {
      message.success(`已清空向量并立即投递 id=${sel.id}`)
      closeSelectedCell()
      await Promise.all([loadAll(), loadHeatmap()])
    } else if (affected > 0) {
      // reset 成功了但没投出去（多半是缺 url / 视频未转码完成 / MQ 暂时不可达）
      message.warning(`已清空向量但未能立即投递 id=${sel.id}（可能缺 url / 视频未转码完成 / MQ 不可达），稍后再点一次「立即重新嵌入」`)
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
  loadList()
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
  loadHeatmap()
}

// ───────────────────────── 数据加载 ─────────────────────────
async function loadHeatmap() {
  // 重新加载会改变 cells 的索引顺序，旧的 selectedCell.idx 不再可信，先清空
  selectedCell.value = null
  heatmapLoading.value = true
  try {
    const r = await getEmbeddingHeatmap(heatmapMediaType.value, heatmapLimit.value)
    const data: any = r as any
    heatmapPoints.value = (data.cells ?? []) as HeatmapPoint[]
    heatmapTotal.value = (data.totalEligible ?? 0) as number
    heatmapReturned.value = (data.returned ?? heatmapPoints.value.length) as number
    lastRefreshAt.value = nowText()
    await nextTick()
    paintHeatmap()
  } catch (e: any) {
    message.error('加载热力图失败：' + (e?.message ?? e))
    heatmapPoints.value = []
    await nextTick()
    paintHeatmap()
  } finally {
    heatmapLoading.value = false
  }
}

async function loadAll() {
  loading.value = true
  try {
    const [p, s] = await Promise.all([getEmbeddingProgress(), getEmbeddingSourceStats()])
    progress.value = p as any
    stats.value = s as any
  } catch (e: any) {
    message.error('加载统计失败：' + (e?.message ?? e))
  } finally {
    loading.value = false
  }
}

async function loadList() {
  listLoading.value = true
  try {
    rows.value = (await listEmbeddingRows(mediaType.value, sourceFilter.value, 100)) as any
  } catch (e: any) {
    message.error('加载列表失败：' + (e?.message ?? e))
    rows.value = []
  } finally {
    listLoading.value = false
  }
}

async function onRetry(row: EmbeddingAdminRow) {
  try {
    const r: any = await retryEmbedding(mediaType.value, row.id)
    const affected = r?.affected ?? 0
    const enqueued = r?.enqueued === true
    if (affected > 0 && enqueued) {
      message.success('已清空向量并立即投递')
      await Promise.all([loadAll(), loadList(), loadHeatmap()])
    } else if (affected > 0) {
      message.warning('已清空向量但未能立即投递（可能缺 url / 视频未转码完成）')
      await Promise.all([loadAll(), loadList(), loadHeatmap()])
    } else {
      message.warning('未更新行（检查 id 是否存在）')
    }
  } catch (e: any) {
    message.error('重试失败：' + (e?.message ?? e))
  }
}

async function onRetranscode(row: EmbeddingAdminRow) {
  try {
    const res: any = await retranscodeVideo(row.hash)
    if (res?.ok) {
      message.success('已触发重转码')
      await Promise.all([loadAll(), loadHeatmap()])
    } else {
      message.error(res?.error ?? '重转码失败')
    }
  } catch (e: any) {
    const detail = e?.response?.data?.error ?? e?.message ?? e
    message.error('重转码失败：' + detail)
  }
}

const columns = computed<DataTableColumns<EmbeddingAdminRow>>(() => [
  { title: 'ID', key: 'id', width: 80 },
  { title: 'hash', key: 'hash', ellipsis: { tooltip: true }, width: 200 },
  {
    title: 'source',
    key: 'embeddingSource',
    width: 72,
    render: (r) => String(r.embeddingSource ?? '—')
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
          { size: 'tiny', type: 'primary', secondary: true, onClick: () => onRetry(row) },
          { default: () => '重试' }
        )
      ]
      if (mediaType.value === 'video') {
        btns.push(
          h(NButton, { size: 'tiny', onClick: () => onRetranscode(row) }, { default: () => '重转码' })
        )
      }
      return h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, btns)
    }
  }
])

// ───────────────────────── 自动刷新 ─────────────────────────
function startAutoRefresh() {
  stopAutoRefresh()
  if (!autoRefresh.value) return
  const ms = Math.max(10, autoRefreshSec.value) * 1000
  autoRefreshTimer = setInterval(() => {
    refreshStatsAndHeatmap()
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
  loadList()
})

// ───────────────────────── 入口 ─────────────────────────
async function refreshStatsAndHeatmap() {
  await loadAll()
  await loadHeatmap()
}

onMounted(async () => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('mousedown', onDocClick)
  await refreshStatsAndHeatmap()
  loadList()
})

onBeforeUnmount(() => {
  stopAutoRefresh()
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('mousedown', onDocClick)
})
</script>

<style scoped>
/* ===========================================================
   整体页面 & 「窗口」外壳
   ========================================================== */
.scanner-app {
  padding: 16px;
  max-width: 1480px;
  margin: 0 auto;
}

.scanner-window {
  border: 1px solid #b8b8b8;
  border-radius: 4px;
  background: #f5f5f0;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
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
  height: 30px;
  padding: 0 12px;
  background: linear-gradient(to bottom, #d8d4c4 0%, #c0bca8 100%);
  border-bottom: 1px solid #a8a48f;
  font-size: 13px;
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
  color: #2563eb;
  font-weight: 600;
}

/* ===========================================================
   工具栏（紧凑米色背景）
   ========================================================== */
.window-toolbar {
  padding: 8px 14px;
  background: #fffbe8;
  border-bottom: 1px solid #e6dcc4;
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
  color: #2563eb;
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
  border: 1px solid #c8c8c8;
  border-radius: 4px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  font-size: 12px;
  overflow: hidden;
  user-select: none;
}
.cp-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: linear-gradient(to bottom, #f0eee2 0%, #e6e3d4 100%);
  border-bottom: 1px solid #d8d4c4;
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
  background: #fafaf6;
  border: 1px solid #d8d8d8;
  border-left: none;
  padding: 6px 10px 8px;
  font-size: 12px;
  display: flex;
  flex-direction: column;
}
.sb-row {
  display: grid;
  grid-template-columns: 1fr 14px auto;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  cursor: pointer;
  border-bottom: 1px dashed transparent;
  transition: background 0.12s;
}
.sb-row:hover {
  background: #fff7d6;
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
  padding: 6px 14px;
  background: #fafaf6;
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
  padding: 8px 14px;
  background: #f0eee2;
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
  background: linear-gradient(to bottom, #1f4f1f 0%, #143614 100%);
  color: #b3ffb3;
  border: 1px solid #0d2a0d;
  border-radius: 3px;
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
  color: #7fc97f;
  font-size: 11px;
}
.m-val {
  color: #d6ffd6;
  font-weight: 600;
}
.m-val.is-good {
  color: #b3ffb3;
}
.m-val.is-warn {
  color: #ffe177;
}
.m-val.is-bad {
  color: #ffadad;
}

/* ===========================================================
   下方明细列表卡
   ========================================================== */
.list-card {
  margin-top: 8px;
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
</style>
