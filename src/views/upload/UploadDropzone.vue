<template>
  <div
    class="upload-dropzone"
    :class="{ 'upload-dropzone--active': isDragOver }"
    :tabindex="0"
    role="button"
    aria-label="点击或拖拽上传文件"
    @click="openPicker"
    @keydown.enter.prevent="openPicker"
    @keydown.space.prevent="openPicker"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent="onDragOver"
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
  >
    <input
      ref="inputRef"
      type="file"
      multiple
      :accept="accept"
      class="upload-dropzone__input"
      @change="onInputChange"
    />
    <div class="upload-dropzone__icon-wrapper">
      <n-icon size="56" :depth="3" class="upload-dropzone__icon">
        <CloudUploadIcon />
      </n-icon>
    </div>
    <div class="upload-dropzone__primary">
      点击或拖拽文件到此处上传
    </div>
    <div class="upload-dropzone__hint">
      支持批量、断点续传与秒传 · 单文件 ≤ 5GB
    </div>
  </div>

  <!-- 整页拖拽遮罩 -->
  <Teleport to="body">
    <transition name="upload-dropzone-mask">
      <div v-if="windowDragOver" class="upload-dropzone__mask">
        <div class="upload-dropzone__mask-inner">
          <n-icon size="80"><CloudUploadIcon /></n-icon>
          <div class="upload-dropzone__mask-text">松开以上传文件</div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { CloudUploadOutline as CloudUploadIcon } from '@vicons/ionicons5'

const props = defineProps<{
  accept?: string
}>()

const emit = defineEmits<{
  (e: 'files', files: File[]): void
}>()

const inputRef = ref<HTMLInputElement | null>(null)
const isDragOver = ref(false)
const windowDragOver = ref(false)
let dragCounter = 0

function openPicker() {
  inputRef.value?.click()
}

function onInputChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files) return
  const arr = Array.from(input.files)
  if (arr.length) emit('files', arr)
  input.value = ''
}

function onDragEnter() {
  isDragOver.value = true
}
function onDragOver() {
  isDragOver.value = true
}
function onDragLeave() {
  isDragOver.value = false
}

function onDrop(e: DragEvent) {
  isDragOver.value = false
  windowDragOver.value = false
  dragCounter = 0
  if (!e.dataTransfer) return
  const files = Array.from(e.dataTransfer.files || [])
  if (files.length) emit('files', files)
}

// 全局窗口拖拽遮罩
function onWindowDragEnter(e: DragEvent) {
  if (e.dataTransfer?.types?.includes('Files')) {
    dragCounter++
    windowDragOver.value = true
  }
}
function onWindowDragLeave() {
  dragCounter = Math.max(0, dragCounter - 1)
  if (dragCounter === 0) windowDragOver.value = false
}
function onWindowDrop() {
  dragCounter = 0
  windowDragOver.value = false
}

onMounted(() => {
  window.addEventListener('dragenter', onWindowDragEnter)
  window.addEventListener('dragleave', onWindowDragLeave)
  window.addEventListener('drop', onWindowDrop)
})
onBeforeUnmount(() => {
  window.removeEventListener('dragenter', onWindowDragEnter)
  window.removeEventListener('dragleave', onWindowDragLeave)
  window.removeEventListener('drop', onWindowDrop)
})

defineExpose({ openPicker })
const _accept = props.accept
void _accept
</script>

<style scoped>
.upload-dropzone {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 36px 16px;
  border: 2px dashed var(--n-border-color);
  border-radius: 12px;
  background: var(--n-color-modal, rgba(127, 127, 127, 0.04));
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s, transform 0.2s;
  user-select: none;
  outline: none;
}
.upload-dropzone:hover,
.upload-dropzone:focus-visible {
  border-color: var(--n-color-target, #2080f0);
  background: var(--n-color-pressed, rgba(32, 128, 240, 0.06));
}
.upload-dropzone--active {
  border-color: var(--n-color-target, #2080f0);
  background: var(--n-color-pressed, rgba(32, 128, 240, 0.1));
  transform: scale(1.005);
}
.upload-dropzone__input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
.upload-dropzone__icon-wrapper {
  margin-bottom: 12px;
}
.upload-dropzone__icon {
  color: var(--n-text-color-3);
  transition: color 0.2s;
}
.upload-dropzone--active .upload-dropzone__icon,
.upload-dropzone:hover .upload-dropzone__icon,
.upload-dropzone:focus-visible .upload-dropzone__icon {
  color: var(--n-color-target, #2080f0);
}
.upload-dropzone__primary {
  font-size: 16px;
  font-weight: 500;
  color: var(--n-text-color);
}
.upload-dropzone__hint {
  margin-top: 6px;
  font-size: 12px;
  color: var(--n-text-color-3);
}

.upload-dropzone__mask {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  backdrop-filter: blur(2px);
}
.upload-dropzone__mask-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  color: #fff;
  gap: 14px;
}
.upload-dropzone__mask-text {
  font-size: 22px;
  font-weight: 600;
}

.upload-dropzone-mask-enter-active,
.upload-dropzone-mask-leave-active {
  transition: opacity 0.18s ease;
}
.upload-dropzone-mask-enter-from,
.upload-dropzone-mask-leave-to {
  opacity: 0;
}

@media (max-width: 768px) {
  .upload-dropzone {
    padding: 24px 12px;
  }
}
</style>
