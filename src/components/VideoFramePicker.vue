<template>
  <div class="video-frame-picker">
    <!--
      原生 <video>，比 video.js 轻 200KB+。preload="metadata" 只拉容器头不立即吃流量。

      crossorigin 设计：
        - 不带（默认）：浏览器走普通跨域媒体加载，永远能播放 / 拖进度，但 canvas 抓帧会抛 SecurityError；
        - "anonymous"：可以 canvas.toDataURL 抓帧，但要求 R2 / CDN 返回 Access-Control-Allow-Origin。

      sources 是降级链：720p → 480p → 原画。每条 src 先用 anonymous 试一次，失败降到无 crossorigin
      （让用户至少能看 / 能拖），仍失败才换下一个画质。
    -->
    <video
      ref="videoRef"
      class="video-frame-picker__video"
      :src="currentSrc"
      :crossorigin="useCors ? 'anonymous' : undefined"
      preload="metadata"
      playsinline
      controls
      @loadedmetadata="onLoadedMetadata"
      @timeupdate="onTimeUpdate"
      @error="onVideoError"
    />

    <div v-if="quality" class="quality-hint">当前画质：{{ quality }}</div>

    <div v-if="errorMsg" class="error">
      {{ errorMsg }}
      <n-button v-if="!useCors" size="tiny" text type="info" @click="retryWithCors">
        已配置 CORS？重试
      </n-button>
    </div>

    <div class="controls">
      <input
        type="range"
        min="0"
        :max="duration || 0"
        step="0.01"
        :value="currentTime"
        :disabled="!ready"
        @input="onSeek(($event.target as HTMLInputElement).valueAsNumber)"
      />
      <span class="time">{{ formatT(currentTime) }} / {{ formatT(duration) }}</span>
      <n-button size="small" type="primary" :disabled="!ready" @click="captureFrame">
        捕获当前帧
      </n-button>
    </div>

    <div v-if="thumbnail" class="preview">
      <div class="preview__title">封面预览</div>
      <img :src="thumbnail" alt="封面预览" />
      <n-flex :size="6" justify="flex-end" style="margin-top: 6px;">
        <n-button size="tiny" tertiary @click="thumbnail = ''">放弃</n-button>
        <n-button size="tiny" type="primary" @click="emitConfirm">使用此帧</n-button>
      </n-flex>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { NButton, NFlex } from 'naive-ui'

const props = defineProps<{
  /**
   * 候选视频源（按推荐顺序）。比如 [720p.mp4, 480p.mp4, original.mp4]。
   * 当前 src 加载失败时自动尝试下一条，直到走完。
   */
  sources: string[]
}>()
const emit = defineEmits<{
  /**
   * 用户确认使用某一帧时触发。data URL 形态，调用方决定是上传还是预览替换 / 落库。
   */
  (e: 'frame-captured', dataUrl: string, currentTimeSec: number): void
}>()

const videoRef = ref<HTMLVideoElement | null>(null)
const duration = ref(0)
const currentTime = ref(0)
const thumbnail = ref('')
const errorMsg = ref('')
const ready = ref(false)
/**
 * CORS 模式开关。当前 src 第一次失败时切到 false 让浏览器无 crossorigin 重试；
 * 仍失败再让 sourceIndex 推进到下一个画质，新画质又会重新尝试 anonymous。
 */
const useCors = ref(true)
/** 当前播放的 sources 下标 */
const sourceIndex = ref(0)

const currentSrc = computed(() => props.sources[sourceIndex.value] || '')

/** 从 url 反推画质标签 (.../720p/720p.mp4 → 720P)，给用户看个提示 */
const quality = computed(() => {
  const m = currentSrc.value.match(/\/(\d+p|original)\/[^/]+$/)
  if (!m) return ''
  return m[1] === 'original' ? '原画' : m[1].toUpperCase()
})

function onLoadedMetadata() {
  const v = videoRef.value
  if (!v) return
  duration.value = Number.isFinite(v.duration) ? v.duration : 0
  currentTime.value = v.currentTime
  ready.value = true
  errorMsg.value = ''
}

function onTimeUpdate() {
  const v = videoRef.value
  if (!v) return
  currentTime.value = v.currentTime
}

function onSeek(t: number) {
  const v = videoRef.value
  if (!v || !Number.isFinite(t)) return
  v.currentTime = t
  currentTime.value = t
}

function onVideoError() {
  // 第一次失败大概率是 R2 没配 CORS 导致 anonymous 加载被拒：
  // 切成无 crossorigin 重试一次，让用户至少能看 / 能拖进度。
  if (useCors.value) {
    useCors.value = false
    errorMsg.value = ''
    return
  }

  // 无 CORS 还是失败 → 这条画质的文件可能根本不存在（转码未完成）。换下一条候选。
  if (sourceIndex.value < props.sources.length - 1) {
    sourceIndex.value += 1
    useCors.value = true // 新画质值得再试一次 anonymous
    errorMsg.value = ''
    return
  }

  // 所有候选都试完了，给用户一段中文错误
  const v = videoRef.value
  const code = v?.error?.code
  errorMsg.value =
    code === 4
      ? '所有画质的视频源都不可用（404 或浏览器不支持的格式）'
      : code === 3
      ? '解码失败，可能是损坏的视频'
      : code === 2
      ? '网络错误，请稍后重试'
      : '视频加载失败'
  ready.value = false
}

/**
 * 拖到当前帧 → 抓画面写到 canvas → toDataURL。
 * 注意 toDataURL 在 video 触发了 CORS 污染时会抛异常；那种情况下回退到提示。
 */
function captureFrame() {
  const v = videoRef.value
  if (!v) return
  const w = v.videoWidth
  const h = v.videoHeight
  if (!w || !h) {
    errorMsg.value = '视频尚未加载到关键帧，请先拖动一下进度条'
    return
  }
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.drawImage(v, 0, 0, w, h)
  try {
    thumbnail.value = canvas.toDataURL('image/jpeg', 0.92)
    errorMsg.value = ''
  } catch (e: any) {
    if (e?.name === 'SecurityError' || /tainted/i.test(e?.message || '')) {
      errorMsg.value =
        '抓帧失败：视频是跨域加载的，浏览器不允许直接读像素。' +
        '请到 R2 bucket 的 CORS 配置加上当前管理后台域名（GET / HEAD），' +
        '或浏览器硬刷新清缓存后重试。'
    } else {
      errorMsg.value = `画面抓取失败：${e?.message || '未知错误'}`
    }
  }
}

function emitConfirm() {
  if (!thumbnail.value) return
  emit('frame-captured', thumbnail.value, currentTime.value)
}

/** 用户配完 R2 CORS 后想重试 anonymous 加载，直接切 useCors 让 Vue 重新拉视频源。 */
function retryWithCors() {
  errorMsg.value = ''
  useCors.value = true
}

function formatT(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s < 10 ? '0' : ''}${s}`
}
</script>

<style scoped>
.video-frame-picker {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.video-frame-picker__video {
  width: 100%;
  max-height: 240px;
  background: #000;
  border-radius: 4px;
  display: block;
}
.quality-hint {
  font-size: 11px;
  color: var(--n-text-color-3, #909090);
  text-align: right;
}
.controls {
  display: flex;
  align-items: center;
  gap: 8px;
}
.controls input[type='range'] {
  flex: 1 1 auto;
}
.time {
  font-size: 11px;
  color: var(--n-text-color-3, #909090);
  font-variant-numeric: tabular-nums;
  min-width: 64px;
}
.preview {
  margin-top: 4px;
  padding: 6px;
  border: 1px solid var(--n-divider-color, rgba(255, 255, 255, 0.08));
  border-radius: 4px;
}
.preview__title {
  font-size: 11px;
  color: var(--n-text-color-3, #909090);
  margin-bottom: 4px;
}
.preview img {
  width: 100%;
  display: block;
  border-radius: 3px;
}
.error {
  font-size: 12px;
  color: var(--n-error-color, #d03050);
}
</style>
