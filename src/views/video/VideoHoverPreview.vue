<template>
  <Teleport to="body">
    <div
      v-if="visible && anchorRect"
      class="hover-preview"
      :style="popoverStyle"
      @mouseenter="$emit('keep-alive')"
      @mouseleave="$emit('close')"
    >
      <video
        v-if="streamUrl"
        ref="videoRef"
        :src="streamUrl"
        autoplay
        muted
        playsinline
        loop
        preload="auto"
        class="hover-preview__video"
        @error="onVideoError"
      />
      <div v-else class="hover-preview__empty">无可用预览流</div>
      <div class="hover-preview__caption">
        <span class="caption-title">{{ title }}</span>
        <span v-if="duration" class="caption-duration">{{ duration }}</span>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, onBeforeUnmount, watch } from 'vue'
import type { VideoItem } from '../../api/manager'
import { formatDuration, get480pStreamUrl } from './composables/videoFormat'
import { useCdnDomain, normalizeCdnOrigin } from './composables/useCdnDomain'

const cdnDomain = useCdnDomain()

const props = defineProps<{
  visible: boolean
  video: VideoItem | null
  anchorRect: DOMRect | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'keep-alive'): void
}>()

const videoRef = ref<HTMLVideoElement | null>(null)

const title = computed(() => props.video?.title || props.video?.fileName || '')
const duration = computed(() => formatDuration(props.video?.durationMs))
const streamUrl = computed(() =>
  props.video?.objectKey ? get480pStreamUrl(props.video.objectKey, normalizeCdnOrigin(cdnDomain.value)) : ''
)

/**
 * 跟随触发卡片定位 popover：默认贴右侧；
 * 视口右侧空间不够（< 410px）时自动改成左侧。
 */
const popoverStyle = computed(() => {
  const rect = props.anchorRect
  if (!rect) return { display: 'none' }
  const W = 400
  const H = Math.round(W * 9 / 16) + 40 // video + caption
  const margin = 12
  let left = rect.right + margin
  if (left + W + margin > window.innerWidth) {
    left = rect.left - W - margin
    if (left < margin) left = margin // 都不够时贴左边
  }
  let top = rect.top + (rect.height - H) / 2
  top = Math.max(margin, Math.min(top, window.innerHeight - H - margin))
  return {
    left: `${left}px`,
    top: `${top}px`,
    width: `${W}px`,
  }
})

function onVideoError() {
  // 转码可能尚未生成 480p；静默关闭，让用户看封面就够了
  emit('close')
}

/**
 * 关闭时主动 pause + 清空 src，立即释放 CDN 连接 + 解码线程。
 * 不依赖 Vue 卸载 video 元素的副作用（不同浏览器表现不一致）。
 */
function teardownVideo() {
  const v = videoRef.value
  if (!v) return
  try {
    v.pause()
    v.removeAttribute('src')
    v.load()
  } catch (_) { /* 浏览器奇怪状态忽略 */ }
}

watch(
  () => props.visible,
  (vis) => {
    if (!vis) teardownVideo()
  }
)
watch(
  () => props.video?.id,
  () => {
    // 切到不同视频时也先清，再让新 src 接管
    teardownVideo()
  }
)

onBeforeUnmount(teardownVideo)
</script>

<style scoped>
/*
  popover 永远走深色容器（视频天然在黑底上更出彩），所以这里不接主题；
  只把阴影做得足够"飘"，浅色页面也能立得住。
*/
.hover-preview {
  position: fixed;
  z-index: 60;
  background: #0d0d10;
  border-radius: 10px;
  overflow: hidden;
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.08),
    0 12px 32px -8px rgba(0, 0, 0, 0.32),
    0 24px 64px -16px rgba(0, 0, 0, 0.24);
  pointer-events: auto;
}
.hover-preview__video {
  width: 100%;
  display: block;
  aspect-ratio: 16 / 9;
  object-fit: contain;
  background: #000;
}
.hover-preview__empty {
  width: 100%;
  aspect-ratio: 16 / 9;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.55);
  font-size: 12px;
}
.hover-preview__caption {
  padding: 8px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.85);
}
.caption-title {
  flex: 1 1 auto;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.caption-duration {
  flex: 0 0 auto;
  font-size: 11px;
  opacity: 0.7;
}
</style>
