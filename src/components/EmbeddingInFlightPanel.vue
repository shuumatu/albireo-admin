<!--
  右下悬浮的「embedding 实时处理」面板。

  设计要点：
    * Teleport 到 body：不受父级 overflow / z-index 影响，挂到屏幕右下绝对定位
    * 2s 轮询 GET /embedding/in-flight：单次 ~2KB JSON，对 metadata-service 几乎零负载
    * 无任务时整个面板 display:none，不留视觉 noise
    * 任务列表按 updatedAt 降序（后端已排过），前端只负责 render
    * 终态行（done 绿 / failed 红）后端会再保留 60s 才清掉，给用户看到结果的窗口
-->
<template>
  <Teleport to="body">
    <transition name="ifp-fade">
      <div v-if="visibleTasks.length > 0" class="ifp-panel" :class="{ 'is-collapsed': collapsed }">
        <div class="ifp-header" @click="collapsed = !collapsed">
          <span class="ifp-dot" :class="{ 'is-busy': hasInProgress }"></span>
          <span class="ifp-title">实时处理</span>
          <span class="ifp-count">{{ inProgressCount }}/{{ visibleTasks.length }}</span>
          <span class="ifp-spacer"></span>
          <span class="ifp-fold">{{ collapsed ? '▴' : '▾' }}</span>
        </div>

        <div v-show="!collapsed" class="ifp-body">
          <div
            v-for="t in visibleTasks"
            :key="t.mediaType + '#' + t.mediaId"
            class="ifp-row"
            :class="rowClass(t)"
          >
            <div class="ifp-row-head">
              <span class="ifp-mtype">{{ t.mediaType === 'video' ? '🎬' : '🖼' }}</span>
              <span class="ifp-id">#{{ t.mediaId }}</span>
              <span v-if="t.hash" class="ifp-hash">{{ t.hash.slice(0, 6) }}</span>
              <span class="ifp-stage">{{ stageLabel(t) }}</span>
              <span class="ifp-spacer"></span>
              <span class="ifp-elapsed">{{ formatElapsed(t.elapsedMs) }}</span>
            </div>
            <div class="ifp-bar-wrap">
              <div class="ifp-bar" :style="{ width: barPct(t) + '%' }"></div>
            </div>
            <div v-if="t.detail" class="ifp-detail" :title="t.detail">{{ t.detail }}</div>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { getEmbeddingInFlight, type InFlightStage, type InFlightTask } from '../api/embedding'

// 轮询间隔：2s 是体感"实时"和后端开销之间的折中
// （后端是内存 ConcurrentHashMap snapshot，没 IO，可以更快但没必要）
const POLL_INTERVAL_MS = 2_000

const tasks = ref<InFlightTask[]>([])
const collapsed = ref(false)
let timer: ReturnType<typeof setInterval> | null = null
let inflight = false  // 防止上一轮还没回来又发新一轮（极端慢网络）

async function pollOnce() {
  if (inflight) return
  inflight = true
  try {
    // 注意：utils/request 的响应拦截器已经把 response.data 解包返回了，
    // 所以这里 await 直接拿到的就是 envelope 本身（不是 AxiosResponse）。
    // axios 的 .get<T>() 类型签名跟运行时实际行为对不上，需要 as any 兜一下。
    const env = (await getEmbeddingInFlight()) as unknown as { tasks?: InFlightTask[] }
    tasks.value = env?.tasks || []
  } catch (e) {
    // 故意只 console.debug，不弹 message —— 这是后台增强观测，
    // 不能因为 metadata-service 偶发抖动给用户弹错
    if (import.meta.env.DEV) {
      console.debug('[InFlightPanel] poll failed (non-fatal):', e)
    }
  } finally {
    inflight = false
  }
}

onMounted(() => {
  pollOnce()
  timer = setInterval(pollOnce, POLL_INTERVAL_MS)
})

onBeforeUnmount(() => {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
})

const visibleTasks = computed(() => tasks.value)
const inProgressCount = computed(() => visibleTasks.value.filter(t => !t.done).length)
const hasInProgress = computed(() => inProgressCount.value > 0)

function rowClass(t: InFlightTask): string {
  if (!t.done) return 'is-running'
  return t.ok ? 'is-done' : 'is-failed'
}

const STAGE_LABEL: Record<InFlightStage, string> = {
  opening: '准备',
  sampling: '采样帧',
  encoding: '推理',
  fusing: '融合',
  done: '完成',
  failed: '失败'
}

function stageLabel(t: InFlightTask): string {
  const base = STAGE_LABEL[t.stage]
  if (t.stage === 'encoding' && t.frameTotal && t.frameTotal > 1 && t.frameIndex != null) {
    return `${base} ${t.frameIndex}/${t.frameTotal}`
  }
  return base
}

/**
 * 进度条百分比。规则：
 *   opening=8 / sampling=18 / encoding=按 frame 比例从 25 涨到 90 / fusing=95
 *   done=100 / failed=保持当前进度（红条）
 * 数字是手调的"视觉节奏"——让用户看到每个阶段都有可感知的推进。
 */
function barPct(t: InFlightTask): number {
  if (t.stage === 'done') return 100
  if (t.stage === 'failed') return 100
  if (t.stage === 'opening') return 8
  if (t.stage === 'sampling') return 18
  if (t.stage === 'fusing') return 95
  if (t.stage === 'encoding') {
    if (!t.frameTotal || t.frameTotal <= 0) return 25
    const ratio = (t.frameIndex || 0) / t.frameTotal
    return 25 + Math.round(ratio * 65)  // 25 → 90
  }
  return 0
}

/**
 * 已耗时格式化：< 60s 显示秒；< 60min 显示 m'ss"；否则显示 h:mm。
 * 视频通常 1~5 min，所以 m'ss" 形式最常见。
 */
function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const ss = s % 60
  if (m < 60) return `${m}'${String(ss).padStart(2, '0')}"`
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${h}:${String(mm).padStart(2, '0')}`
}
</script>

<style scoped>
.ifp-panel {
  position: fixed;
  right: 16px;
  bottom: 16px;
  width: 320px;
  max-height: 60vh;
  background: rgba(28, 28, 32, 0.92);
  color: #f1f1f1;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 12px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  backdrop-filter: blur(8px);
}

.ifp-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.25);
  cursor: pointer;
  user-select: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.ifp-header:hover { background: rgba(0, 0, 0, 0.35); }

.ifp-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #4a4a4a;
}
.ifp-dot.is-busy {
  background: #22c55e;
  animation: ifp-pulse 1.4s ease-in-out infinite;
}
@keyframes ifp-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%      { opacity: 0.5; transform: scale(1.2); }
}

.ifp-title { font-weight: 600; letter-spacing: 0.3px; }
.ifp-count {
  background: rgba(255, 255, 255, 0.1);
  padding: 1px 6px;
  border-radius: 8px;
  font-size: 11px;
  color: #d0d0d0;
}
.ifp-spacer { flex: 1; }
.ifp-fold { font-size: 10px; color: #888; }

.ifp-body {
  padding: 6px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ifp-row {
  background: rgba(255, 255, 255, 0.04);
  border-left: 3px solid #4f9bff;
  padding: 6px 8px;
  border-radius: 4px;
  transition: background 0.2s;
}
.ifp-row.is-done   { border-left-color: #22c55e; opacity: 0.85; }
.ifp-row.is-failed { border-left-color: #ef4444; }

.ifp-row-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
  font-size: 11.5px;
}
.ifp-mtype { font-size: 13px; }
.ifp-id    { color: #f1f1f1; font-weight: 500; }
.ifp-hash  {
  color: #888;
  font-family: 'SF Mono', Consolas, monospace;
  font-size: 10.5px;
}
.ifp-stage {
  color: #d4d4d4;
  margin-left: 2px;
}
.ifp-elapsed {
  color: #888;
  font-family: 'SF Mono', Consolas, monospace;
  font-size: 10.5px;
}

.ifp-bar-wrap {
  height: 3px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
  overflow: hidden;
}
.ifp-bar {
  height: 100%;
  background: linear-gradient(90deg, #4f9bff, #22d3ee);
  transition: width 0.4s ease-out;
}
.is-done .ifp-bar   { background: #22c55e; }
.is-failed .ifp-bar { background: #ef4444; }

.ifp-detail {
  margin-top: 4px;
  font-size: 10.5px;
  color: #f5b800;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.is-failed .ifp-detail { color: #ff8a8a; }

.ifp-fade-enter-from { opacity: 0; transform: translateY(8px); }
.ifp-fade-enter-active,
.ifp-fade-leave-active { transition: opacity 0.25s, transform 0.25s; }
.ifp-fade-leave-to { opacity: 0; transform: translateY(8px); }
</style>
