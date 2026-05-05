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
void props.accept // 仅用于 IDE 提示，accept 由模板使用

const emit = defineEmits<{
  (e: 'files', files: File[]): void
}>()

const inputRef = ref<HTMLInputElement | null>(null)
const isDragOver = ref(false)
const windowDragOver = ref(false)
let dragCounter = 0
let resetMaskTimer: number | null = null

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

function isFileDrag(e: DragEvent): boolean {
  // dataTransfer.types 是 DOMStringList，类型上 includes 不一定可用，转一下
  const types = e.dataTransfer?.types
  if (!types) return false
  for (let i = 0; i < types.length; i++) {
    if (types[i] === 'Files') return true
  }
  return false
}

function clearMask() {
  dragCounter = 0
  windowDragOver.value = false
  if (resetMaskTimer != null) {
    window.clearTimeout(resetMaskTimer)
    resetMaskTimer = null
  }
}

/** 兜底：超过 1.5 秒没有任何 dragover 心跳，强制清掉遮罩，避免计数器卡住 */
function scheduleMaskReset() {
  if (resetMaskTimer != null) window.clearTimeout(resetMaskTimer)
  resetMaskTimer = window.setTimeout(() => {
    if (windowDragOver.value) clearMask()
  }, 1500)
}

function onDragEnter() {
  isDragOver.value = true
}
function onDragOver(e: DragEvent) {
  e.preventDefault()
  isDragOver.value = true
}
function onDragLeave() {
  isDragOver.value = false
}

function onDrop(e: DragEvent) {
  isDragOver.value = false
  clearMask()
  if (!e.dataTransfer) return
  const files = Array.from(e.dataTransfer.files || [])
  if (files.length) emit('files', files)
}

// ============== 全局窗口级拖拽 ==============
// 关键：必须在 window 上 preventDefault dragover/drop，否则：
//   1) 浏览器默认 dragover 不接受 drop，遮罩内非 dropzone 区域 drop 无效
//   2) 落到 body 上的 drop 会被浏览器当作"导航到该文件"，整个 SPA 会被替换

function onWindowDragEnter(e: DragEvent) {
  if (!isFileDrag(e)) return
  dragCounter++
  windowDragOver.value = true
  scheduleMaskReset()
}

function onWindowDragOver(e: DragEvent) {
  if (!isFileDrag(e)) return
  e.preventDefault()
  // 心跳：刷新遮罩兜底定时器
  if (windowDragOver.value) scheduleMaskReset()
}

function onWindowDragLeave(e: DragEvent) {
  if (!isFileDrag(e)) return
  dragCounter = Math.max(0, dragCounter - 1)
  if (dragCounter === 0) clearMask()
}

function onWindowDrop(e: DragEvent) {
  if (!isFileDrag(e)) {
    clearMask()
    return
  }
  // 兜底：避免浏览器把文件当导航处理
  e.preventDefault()
  clearMask()
  // 全屏遮罩承诺"任何位置 drop 都生效"，所以 window 级 drop 也接受文件
  const files = Array.from(e.dataTransfer?.files || [])
  if (files.length) emit('files', files)
}

function onWindowDragEnd() {
  // 用户按 Esc 取消时，浏览器只触发 dragend，不会触发 drop / dragleave
  clearMask()
}

function onWindowBlur() {
  // tab 切走时也清遮罩
  clearMask()
}

onMounted(() => {
  window.addEventListener('dragenter', onWindowDragEnter)
  window.addEventListener('dragover', onWindowDragOver)
  window.addEventListener('dragleave', onWindowDragLeave)
  window.addEventListener('drop', onWindowDrop)
  window.addEventListener('dragend', onWindowDragEnd)
  window.addEventListener('blur', onWindowBlur)
})
onBeforeUnmount(() => {
  window.removeEventListener('dragenter', onWindowDragEnter)
  window.removeEventListener('dragover', onWindowDragOver)
  window.removeEventListener('dragleave', onWindowDragLeave)
  window.removeEventListener('drop', onWindowDrop)
  window.removeEventListener('dragend', onWindowDragEnd)
  window.removeEventListener('blur', onWindowBlur)
  if (resetMaskTimer != null) window.clearTimeout(resetMaskTimer)
})

defineExpose({ openPicker })
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
