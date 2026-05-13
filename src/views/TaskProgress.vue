<template>
  <div class="tp-page">
    <!-- 顶部：标题 + 概览 -->
    <header class="tp-header">
      <div class="tp-title-line">
        <h2 class="tp-title">处理进度</h2>
        <n-tag v-if="tasks.length > 0" type="info" size="small" round>
          {{ tasks.length }} 个任务
        </n-tag>
        <span v-if="lastUpdatedText" class="tp-updated">最近刷新 {{ lastUpdatedText }}</span>
      </div>
      <div class="tp-actions">
        <n-switch v-model:value="autoRefresh" size="small" />
        <span class="tp-actions-label">自动刷新</span>
        <n-button :loading="loading" @click="fetchTasks" size="small" tertiary>刷新</n-button>
      </div>
    </header>

    <!-- 概览卡（仅在有任务时显示） -->
    <div v-if="tasks.length > 0" class="tp-summary">
      <div class="tp-summary-cell tp-summary-cell--video" :class="{ 'is-zero': summary.video === 0 }">
        <span class="tp-summary-icon icon-video" />
        <div>
          <div class="tp-summary-num">{{ summary.video }}</div>
          <div class="tp-summary-key">视频</div>
        </div>
      </div>
      <div class="tp-summary-cell tp-summary-cell--image" :class="{ 'is-zero': summary.image === 0 }">
        <span class="tp-summary-icon icon-image" />
        <div>
          <div class="tp-summary-num">{{ summary.image }}</div>
          <div class="tp-summary-key">图片</div>
        </div>
      </div>
      <div class="tp-summary-cell tp-summary-cell--running">
        <span class="tp-summary-icon icon-running" />
        <div>
          <div class="tp-summary-num">{{ summary.running }}</div>
          <div class="tp-summary-key">进行中</div>
        </div>
      </div>
      <div class="tp-summary-cell tp-summary-cell--failed" :class="{ 'is-zero': summary.failed === 0 }">
        <span class="tp-summary-icon icon-failed" />
        <div>
          <div class="tp-summary-num">{{ summary.failed }}</div>
          <div class="tp-summary-key">失败</div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <n-empty
      v-if="!loading && tasks.length === 0"
      description="当前没有处理中的任务"
      class="tp-empty"
    />

    <!-- 任务卡片列表 -->
    <div v-if="tasks.length > 0" class="tp-list">
      <div
        v-for="task in tasks"
        :key="task.hash"
        class="tp-card"
        :class="cardClass(task)"
      >
        <!-- 行 1：图标 / 文件名 / 标签 / 状态 / 操作 -->
        <div class="tp-card-head">
          <div class="tp-card-icon" :class="task.type">
            <span class="tp-card-icon-glyph" :class="task.type === 'video' ? 'icon-video' : 'icon-image'" />
          </div>

          <div class="tp-card-meta">
            <n-ellipsis class="tp-card-name">{{ task.fileName }}</n-ellipsis>
            <div class="tp-card-tags">
              <n-tag :type="typeTagType(task.type)" size="tiny" round>
                {{ task.type === 'video' ? '视频' : '图片' }}
              </n-tag>
              <span class="tp-card-time">{{ formatTime(task.createdAt) }}</span>
              <span class="tp-card-hash" :title="task.hash">#{{ task.hash.slice(0, 8) }}</span>
            </div>
          </div>

          <div class="tp-card-status">
            <n-tag :type="statusTagType(task.status)" size="small" round :bordered="false">
              <template #icon>
                <span class="tp-status-dot" :class="task.status" />
              </template>
              {{ statusLabel(task.status) }}
            </n-tag>
            <n-button
              v-if="task.status === 'ai_analyze_failed'"
              size="tiny"
              type="warning"
              :loading="retryingHash === task.hash"
              @click="handleRetry(task.hash)"
            >
              重试 AI 分析
            </n-button>
          </div>
        </div>

        <!-- 行 2：阶段步骤条（永远显示） + 百分比（仅 transcoding/processing 显示） -->
        <div class="tp-card-progress">
          <!-- 步骤标签：highlight 当前所在阶段 -->
          <div class="tp-stages">
            <div
              v-for="(stage, i) in stagesOf(task)"
              :key="i"
              class="tp-stage"
              :class="{
                'is-done': stage.done,
                'is-active': stage.active,
                'is-failed': stage.failed
              }"
            >
              <span class="tp-stage-dot"></span>
              <span class="tp-stage-label">{{ stage.label }}</span>
            </div>
          </div>

          <!-- 百分比进度条：有 progress 数字时显示真实百分比；否则显示不确定动画 -->
          <div class="tp-bar-wrap">
            <div class="tp-bar-track">
              <div
                v-if="hasNumericProgress(task)"
                class="tp-bar-fill"
                :class="barColorClass(task)"
                :style="{ width: clampPct(task.progress) + '%' }"
              ></div>
              <div
                v-else-if="isRunning(task)"
                class="tp-bar-fill tp-bar-indeterminate"
                :class="barColorClass(task)"
              ></div>
              <div
                v-else-if="isFailed(task)"
                class="tp-bar-fill is-failed"
                :style="{ width: '100%' }"
              ></div>
              <div
                v-else-if="task.status === 'done'"
                class="tp-bar-fill is-done"
                :style="{ width: '100%' }"
              ></div>
            </div>
            <div class="tp-bar-text">
              <span v-if="hasNumericProgress(task)" class="tp-bar-pct">
                {{ clampPct(task.progress) }}%
              </span>
              <span v-else-if="isFailed(task)" class="tp-bar-pct tp-bar-pct--failed">
                已停止
              </span>
              <span v-else-if="task.status === 'done'" class="tp-bar-pct tp-bar-pct--done">
                100%
              </span>
              <span v-else class="tp-bar-pct tp-bar-pct--ind">
                {{ isRunning(task) ? '处理中…' : '排队' }}
              </span>
            </div>
          </div>

          <!-- 行 3（仅视频转码）：各清晰度子进度，让运营看到"当前哪一档在转、哪一档已完成" -->
          <div
            v-if="qualityRowsOf(task).length > 0"
            class="tp-quality-row"
          >
            <div
              v-for="q in qualityRowsOf(task)"
              :key="q.label"
              class="tp-quality-chip"
              :class="qualityChipClass(q.percent)"
              :title="`${q.label}: ${q.percent}%`"
            >
              <span class="tp-quality-label">{{ q.label }}</span>
              <span class="tp-quality-mini">
                <span class="tp-quality-mini-fill" :style="{ width: q.percent + '%' }"></span>
              </span>
              <span class="tp-quality-pct">{{ q.percent }}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { useMessage } from 'naive-ui'
import { fetchProcessingTasks, retryAiAnalyze, type TaskProgressVO } from '../api/task'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-cn'

dayjs.extend(relativeTime)
dayjs.locale('zh-cn')

const message = useMessage()
const tasks = ref<TaskProgressVO[]>([])
const loading = ref(false)
const retryingHash = ref<string | null>(null)
const autoRefresh = ref(true)
const lastUpdatedAt = ref<number | null>(null)
let timer: ReturnType<typeof setInterval> | null = null
let nowTimer: ReturnType<typeof setInterval> | null = null
const nowTick = ref(0) // 用来让 lastUpdatedText 每秒重算

// 阶段定义：用于步骤条 + 失败时定位"卡在哪一步"
const VIDEO_STAGES: { key: string; label: string }[] = [
  { key: 'uploading', label: '上传' },
  { key: 'pending', label: '排队' },
  { key: 'transcoding', label: '转码' },
  { key: 'ai_analyzing', label: 'AI 分析' },
  { key: 'done', label: '完成' }
]
const IMAGE_STAGES: { key: string; label: string }[] = [
  { key: 'uploading', label: '上传' },
  { key: 'pending', label: '排队' },
  { key: 'processing', label: '处理' },
  { key: 'done', label: '完成' }
]

/**
 * 失败状态映射回它"卡住的那一步"——让步骤条把红色定位到对应分段：
 *   ai_analyze_failed → 卡在 ai_analyzing
 *   transcode_failed  → 卡在 transcoding
 *   process_failed    → 卡在 processing
 *   failed            → 通用失败，归在 uploading（第一段）
 */
const FAILED_STEP_MAP: Record<string, string> = {
  ai_analyze_failed: 'ai_analyzing',
  transcode_failed: 'transcoding',
  process_failed: 'processing',
  failed: 'uploading'
}

function stagesOf(task: TaskProgressVO) {
  const defs = task.type === 'video' ? VIDEO_STAGES : IMAGE_STAGES
  const stuckAt = FAILED_STEP_MAP[task.status]
  const failed = stuckAt !== undefined
  const effective = failed ? stuckAt : task.status
  const currentIdx = defs.findIndex(s => s.key === effective)
  return defs.map((s, i) => ({
    label: s.label,
    done: !failed && currentIdx >= 0 && i < currentIdx,
    active: i === currentIdx && !failed,
    failed: failed && i === currentIdx
  }))
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
    failed: '失败'
  }
  return map[status] ?? status
}

function statusTagType(status: string) {
  if (
    status === 'failed' ||
    status === 'ai_analyze_failed' ||
    status === 'transcode_failed' ||
    status === 'process_failed'
  ) {
    return 'error'
  }
  if (status === 'done') return 'success'
  if (status === 'pending') return 'default'
  return 'warning'
}

function typeTagType(type: string) {
  return type === 'video' ? 'info' : 'success'
}

function formatTime(iso: string) {
  return dayjs(iso).fromNow()
}

function isRunning(task: TaskProgressVO) {
  return ['uploading', 'pending', 'transcoding', 'processing', 'ai_analyzing'].includes(task.status)
}

function isFailed(task: TaskProgressVO) {
  return FAILED_STEP_MAP[task.status] !== undefined
}

/** 是否需要显示真实百分比（仅 transcoding 和 processing 才有 progress 数字） */
function hasNumericProgress(task: TaskProgressVO) {
  return task.progress != null && (task.status === 'transcoding' || task.status === 'processing')
}

/**
 * 当前转码任务下要展示的"各清晰度子进度"。仅 video + transcoding 才返回非空，
 * 其它情况一律空数组（让模板用 v-if 一句话隐藏整行）。
 *
 * 顺序按 qualityProgress 自然顺序（后端用 LinkedHashMap 保证 1080p / 720p / 480p）。
 */
const QUALITY_LABEL: Record<string, string> = {
  '1080p': '1080P',
  '720p': '720P',
  '480p': '480P',
}
function qualityRowsOf(task: TaskProgressVO): { label: string; percent: number }[] {
  if (task.type !== 'video' || task.status !== 'transcoding' || !task.qualityProgress) {
    return []
  }
  const out: { label: string; percent: number }[] = []
  for (const [resolution, percent] of Object.entries(task.qualityProgress)) {
    out.push({
      label: QUALITY_LABEL[resolution] ?? resolution,
      percent: clampPct(percent),
    })
  }
  return out
}
function qualityChipClass(percent: number) {
  if (percent >= 100) return 'is-done'
  if (percent > 0) return 'is-active'
  return 'is-pending'
}

function clampPct(p: number | null | undefined): number {
  if (p == null) return 0
  return Math.max(0, Math.min(100, Math.round(p)))
}

function barColorClass(task: TaskProgressVO) {
  if (isFailed(task)) return 'is-failed'
  if (task.status === 'done') return 'is-done'
  if (task.status === 'transcoding' || task.status === 'processing') return 'is-active'
  if (task.status === 'ai_analyzing') return 'is-ai'
  return 'is-pending'
}

function cardClass(task: TaskProgressVO) {
  if (isFailed(task)) return 'is-failed'
  if (task.status === 'done') return 'is-done'
  if (isRunning(task)) return 'is-running'
  return ''
}

const summary = computed(() => {
  let video = 0, image = 0, running = 0, failed = 0
  for (const t of tasks.value) {
    if (t.type === 'video') video++
    else if (t.type === 'image') image++
    if (isRunning(t)) running++
    if (isFailed(t)) failed++
  }
  return { video, image, running, failed }
})

const lastUpdatedText = computed(() => {
  void nowTick.value
  if (!lastUpdatedAt.value) return ''
  const diffSec = Math.max(0, Math.round((Date.now() - lastUpdatedAt.value) / 1000))
  if (diffSec < 5) return '刚刚'
  if (diffSec < 60) return `${diffSec} 秒前`
  return `${Math.floor(diffSec / 60)} 分钟前`
})

async function fetchTasks() {
  loading.value = true
  try {
    const res = await fetchProcessingTasks()
    tasks.value = Array.isArray(res) ? res : ((res as any).data ?? [])
    lastUpdatedAt.value = Date.now()
  } catch {
    message.error('获取任务列表失败')
  } finally {
    loading.value = false
  }
}

async function handleRetry(hash: string) {
  retryingHash.value = hash
  try {
    await retryAiAnalyze(hash)
    message.success('已重新发送 AI 分析任务')
    await fetchTasks()
  } catch {
    message.error('重试失败')
  } finally {
    retryingHash.value = null
  }
}

function startPolling() {
  stopPolling()
  // 处理中阶段：2s 一次给到接近实时的 progress 反馈
  // （后端 task/processing 是单条 SQL + 内存 map merge，开销可忽略）
  timer = setInterval(fetchTasks, 2000)
}

function stopPolling() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

watch(autoRefresh, (val) => {
  if (val) startPolling()
  else stopPolling()
})

onMounted(() => {
  fetchTasks()
  if (autoRefresh.value) startPolling()
  // 1s tick 让 "最近刷新" 时间标签自动滚动
  nowTimer = setInterval(() => { nowTick.value++ }, 1000)
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
/* ============================== 页面外壳 ============================== */
.tp-page {
  padding: 20px 32px 40px;
  max-width: 1280px;
  margin: 0 auto;
}

.tp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.tp-title-line {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.tp-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
  letter-spacing: 0.3px;
  color: #1f1f1f;
}

.tp-updated {
  font-size: 12px;
  color: #999;
  margin-left: 4px;
}

.tp-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tp-actions-label {
  font-size: 13px;
  color: #999;
  white-space: nowrap;
}

/* ============================== 概览卡 ============================== */
.tp-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.tp-summary-cell {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: #fff;
  border: 1px solid #f0f0f0;
  border-radius: 10px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
  transition: background 0.2s;
}

.tp-summary-cell.is-zero {
  opacity: 0.5;
}

.tp-summary-icon {
  width: 38px;
  height: 38px;
  display: inline-block;
  background: #f6f6f6;
  border-radius: 9px;
  flex-shrink: 0;
  position: relative;
}

/* 用 ::before 渲染 PNG 图标的剪影（mask 把 PNG 当作 alpha 蒙版 +
 * background-color 控色），这样四个概览卡的图标自然吸取各自主题色。 */
.tp-summary-icon::before {
  content: '';
  position: absolute;
  inset: 0;
  margin: auto;
  width: 22px;
  height: 22px;
  background-color: currentColor;
  -webkit-mask-position: center;
          mask-position: center;
  -webkit-mask-repeat: no-repeat;
          mask-repeat: no-repeat;
  -webkit-mask-size: contain;
          mask-size: contain;
}
.tp-summary-icon.icon-video::before {
  -webkit-mask-image: url('../assets/icons/Videocam.png');
          mask-image: url('../assets/icons/Videocam.png');
}
.tp-summary-icon.icon-image::before {
  -webkit-mask-image: url('../assets/icons/MdImages.png');
          mask-image: url('../assets/icons/MdImages.png');
}
.tp-summary-icon.icon-running::before {
  -webkit-mask-image: url('../assets/icons/SettingsSuggestTwotone.png');
          mask-image: url('../assets/icons/SettingsSuggestTwotone.png');
}
.tp-summary-icon.icon-failed::before {
  -webkit-mask-image: url('../assets/icons/WarningSharp.png');
          mask-image: url('../assets/icons/WarningSharp.png');
}

.tp-summary-num {
  font-size: 20px;
  font-weight: 600;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: #1f1f1f;
  line-height: 1.1;
}

.tp-summary-key {
  font-size: 12px;
  color: #999;
  margin-top: 2px;
}

/* 视频 / 图片：浅色底 + 中性色图标，避免和右侧数字抢眼 */
.tp-summary-cell--video .tp-summary-icon {
  background: #eaf3ff;
  color: #2080f0;
}
.tp-summary-cell--image .tp-summary-icon {
  background: #ecf8ec;
  color: #18a058;
}

.tp-summary-cell--running .tp-summary-icon {
  background: #fff7e6;
  color: #f0a020;
}
.tp-summary-cell--running .tp-summary-num {
  color: #f0a020;
}
.tp-summary-cell--failed .tp-summary-icon {
  background: #fff1f0;
  color: #d03050;
}
.tp-summary-cell--failed .tp-summary-num {
  color: #d03050;
}

/* ============================== 空状态 ============================== */
.tp-empty {
  margin-top: 80px;
}

/* ============================== 任务卡片列表 ============================== */
.tp-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tp-card {
  background: #fff;
  border: 1px solid #f0f0f0;
  border-radius: 12px;
  padding: 14px 18px 12px;
  transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
}
.tp-card:hover {
  border-color: #e0e0e0;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
}
.tp-card.is-running {
  border-left: 3px solid #f0a020;
  padding-left: 15px;
}
.tp-card.is-done {
  border-left: 3px solid #36ad6a;
  padding-left: 15px;
  opacity: 0.85;
}
.tp-card.is-failed {
  border-left: 3px solid #d03050;
  padding-left: 15px;
  background: #fffafa;
}

/* 行 1：头部 */
.tp-card-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.tp-card-icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.tp-card-icon.video {
  background: #e8f4fd;
  color: #2080f0;
}
.tp-card-icon.image {
  background: #e8fde8;
  color: #18a058;
}

/* 卡片内的图标 glyph 同样用 PNG mask，颜色继承 .tp-card-icon 的 color。 */
.tp-card-icon-glyph {
  display: inline-block;
  width: 22px;
  height: 22px;
  background-color: currentColor;
  -webkit-mask-position: center;
          mask-position: center;
  -webkit-mask-repeat: no-repeat;
          mask-repeat: no-repeat;
  -webkit-mask-size: contain;
          mask-size: contain;
}
.tp-card-icon-glyph.icon-video {
  -webkit-mask-image: url('../assets/icons/Videocam.png');
          mask-image: url('../assets/icons/Videocam.png');
}
.tp-card-icon-glyph.icon-image {
  -webkit-mask-image: url('../assets/icons/MdImages.png');
          mask-image: url('../assets/icons/MdImages.png');
}

.tp-card-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tp-card-name {
  font-weight: 500;
  font-size: 14px;
  color: #222;
}

.tp-card-tags {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #999;
}
.tp-card-time {
  color: #aaa;
}
.tp-card-hash {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  color: #bbb;
  background: #fafafa;
  padding: 1px 6px;
  border-radius: 4px;
}

.tp-card-status {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  flex-shrink: 0;
}

/* ============================== 状态点 ============================== */
.tp-status-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  margin-right: 2px;
}
.tp-status-dot.uploading,
.tp-status-dot.transcoding,
.tp-status-dot.ai_analyzing,
.tp-status-dot.processing {
  background: #f0a020;
  animation: tp-pulse 1.5s ease-in-out infinite;
}
.tp-status-dot.pending {
  background: #aaa;
}
.tp-status-dot.done {
  background: #36ad6a;
}
.tp-status-dot.failed,
.tp-status-dot.ai_analyze_failed,
.tp-status-dot.transcode_failed,
.tp-status-dot.process_failed {
  background: #d03050;
}

@keyframes tp-pulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.4; }
}

/* ============================== 行 2：进度条区 ============================== */
.tp-card-progress {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed #f3f3f3;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 阶段文字步骤：每段一个圆点 + label，当前段加粗 + 颜色 */
.tp-stages {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  font-size: 11.5px;
}
.tp-stage {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #ccc;
  padding: 0 4px 0 0;
}
.tp-stage:not(:last-child)::after {
  content: '›';
  color: #ddd;
  margin-left: 2px;
}
.tp-stage.is-done {
  color: #36ad6a;
}
.tp-stage.is-active {
  color: #f0a020;
  font-weight: 600;
}
.tp-stage.is-failed {
  color: #d03050;
  font-weight: 600;
}
.tp-stage-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.7;
}
.tp-stage.is-active .tp-stage-dot,
.tp-stage.is-failed .tp-stage-dot {
  animation: tp-pulse 1.5s ease-in-out infinite;
}

/* 进度条主体 */
.tp-bar-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
}
.tp-bar-track {
  flex: 1;
  height: 8px;
  background: #f3f3f3;
  border-radius: 4px;
  overflow: hidden;
  position: relative;
}
.tp-bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}
.tp-bar-fill.is-active {
  background: linear-gradient(90deg, #f0a020, #f7c878);
  box-shadow: 0 0 8px rgba(240, 160, 32, 0.35);
}
.tp-bar-fill.is-ai {
  background: linear-gradient(90deg, #4f9bff, #22d3ee);
}
.tp-bar-fill.is-done {
  background: linear-gradient(90deg, #36ad6a, #6dd4a3);
}
.tp-bar-fill.is-failed {
  background: linear-gradient(90deg, #d03050, #f08080);
}
.tp-bar-fill.is-pending {
  background: #d8d8d8;
}

/* 不确定动画：30% 宽度的小条左右滑动，用于没有具体百分比但仍在跑的阶段 */
.tp-bar-indeterminate {
  width: 35% !important;
  position: absolute;
  left: 0;
  animation: tp-indeterminate 1.6s ease-in-out infinite;
}
@keyframes tp-indeterminate {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(285%); }
}

.tp-bar-text {
  flex-shrink: 0;
  min-width: 56px;
  text-align: right;
}
.tp-bar-pct {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  font-weight: 600;
  color: #f0a020;
  letter-spacing: 0.2px;
}
.tp-bar-pct--done   { color: #36ad6a; }
.tp-bar-pct--failed { color: #d03050; }
.tp-bar-pct--ind {
  color: #999;
  font-weight: 500;
  font-size: 12px;
}

/* ============================== 各清晰度子进度（仅 transcoding） ============================== */
.tp-quality-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 6px;
}
.tp-quality-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  border-radius: 999px;
  background: #f3f4f6;
  font-size: 11px;
  color: #555;
  font-variant-numeric: tabular-nums;
}
.tp-quality-chip.is-active {
  background: rgba(240, 160, 32, 0.12);
  color: #b67200;
}
.tp-quality-chip.is-done {
  background: rgba(54, 173, 106, 0.12);
  color: #2d8e57;
}
.tp-quality-label {
  font-weight: 600;
  letter-spacing: 0.2px;
}
.tp-quality-mini {
  display: inline-block;
  position: relative;
  width: 60px;
  height: 4px;
  background: rgba(0, 0, 0, 0.08);
  border-radius: 2px;
  overflow: hidden;
}
.tp-quality-mini-fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: currentColor;
  border-radius: 2px;
  transition: width 220ms ease;
}
.tp-quality-pct {
  font-size: 10px;
  opacity: 0.8;
  min-width: 28px;
  text-align: right;
}

/* 小屏：概览改 2 列 */
@media (max-width: 720px) {
  .tp-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .tp-card-head {
    flex-wrap: wrap;
  }
  .tp-card-status {
    align-items: flex-start;
    width: 100%;
    flex-direction: row;
    justify-content: space-between;
  }
}
</style>
