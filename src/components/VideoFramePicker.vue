<template>
  <div class="video-frame-picker">
    <video-js
      ref="playerRef"
      class="vjs-big-play-centered"
      :options="playerOptions"
      @ready="onPlayerReady"
    ></video-js>

    <div class="controls">
      <input type="range" min="0" :max="duration" step="0.01" v-model="currentTime" @input="seekVideo"/>
      <button @click="captureFrame">捕获当前帧作为封面</button>
    </div>

    <div v-if="thumbnail">
      <h3>封面预览</h3>
      <img :src="thumbnail" alt="视频封面" />
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, watch } from 'vue'
import VideoJS from '@videojs-player/vue'
import 'video.js/dist/video-js.css'

const props = defineProps({
  src: { type: String, required: true } // 视频地址
})

const playerRef = ref(null)
const player = ref(null)
const duration = ref(0)
const currentTime = ref(0)
const thumbnail = ref('')

const playerOptions = reactive({
  controls: true,
  autoplay: false,
  preload: 'auto',
  fluid: true,
  sources: [{ src: props.src, type: 'video/mp4' }]
})

const onPlayerReady = (p) => {
  player.value = p
  duration.value = p.duration()
  p.on('timeupdate', () => {
    currentTime.value = p.currentTime()
  })
}

const seekVideo = () => {
  if (player.value) {
    player.value.currentTime(currentTime.value)
  }
}

const captureFrame = () => {
  if (!player.value) return
  const videoEl = player.value.el().querySelector('video')
  const canvas = document.createElement('canvas')
  canvas.width = videoEl.videoWidth
  canvas.height = videoEl.videoHeight
  const ctx = canvas.getContext('2d')
  ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height)
  thumbnail.value = canvas.toDataURL('image/jpeg')
}
</script>

<style scoped>
.video-frame-picker {
  max-width: 800px;
  margin: auto;
}

.controls {
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
}

img {
  max-width: 100%;
  margin-top: 10px;
  border: 1px solid #ccc;
}
</style>
