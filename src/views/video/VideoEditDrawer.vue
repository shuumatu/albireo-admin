<template>
  <n-drawer
    :show="show"
    :width="540"
    placement="right"
    :mask-closable="true"
    :close-on-esc="true"
    :show-mask="false"
    @update:show="(v: boolean) => $emit('update:show', v)"
  >
    <!--
      n-drawer 走 Teleport，drawer 整棵子树离开了 .video-list-page，
      无法继承父级注入的 --n-* 变量。在 n-drawer-content 这一层把 token 注回去，
      header / body / footer 三个 slot 内的自写 css var 才有依据。
    -->
    <n-drawer-content closable :style="themeCssVars">
      <template #header>
        <n-flex align="center" :wrap="false" :size="6">
          <n-button
            quaternary
            circle
            size="small"
            :disabled="!hasPrev"
            @click="$emit('navigate', -1)"
            title="上一个 (↑)"
          >
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path d="M14 7l-5 5 5 5V7z" fill="currentColor" />
            </svg>
          </n-button>
          <n-button
            quaternary
            circle
            size="small"
            :disabled="!hasNext"
            @click="$emit('navigate', 1)"
            title="下一个 (↓)"
          >
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path d="M10 7v10l5-5z" fill="currentColor" />
            </svg>
          </n-button>
          <span class="drawer-title">{{ video?.title || video?.fileName || '视频详情' }}</span>
        </n-flex>
      </template>

      <template #footer>
        <n-flex justify="space-between" align="center" style="width: 100%;">
          <span class="save-status">
            <span v-if="saveStatus === 'saving'">保存中…</span>
            <span v-else-if="saveStatus === 'saved'">已保存于 {{ savedAtText }}</span>
            <span v-else-if="saveStatus === 'error'" style="color: var(--n-error-color);">保存失败：{{ saveError }}</span>
          </span>
          <n-flex :size="6">
            <n-button size="small" @click="$emit('open-public')">在新窗口播放</n-button>
            <n-popconfirm @positive-click="$emit('delete')">
              <template #trigger>
                <n-button size="small" type="error" tertiary>删除</n-button>
              </template>
              确定删除该视频？此操作不可恢复。
            </n-popconfirm>
          </n-flex>
        </n-flex>
      </template>

      <div v-if="video" class="drawer-body">
        <!-- 顶部：缩略图 + 行内标题输入 -->
        <div class="drawer-cover">
          <img v-if="video.coverUrl" :src="video.coverUrl" :alt="video.fileName" />
          <div v-else class="drawer-cover__placeholder">无封面</div>
        </div>

        <!-- 标题：默认像普通文字，hover 出下划线，聚焦后变 input。失焦自动保存 -->
        <div class="title-edit">
          <input
            class="title-edit__input"
            type="text"
            :value="form.title ?? ''"
            :placeholder="video.fileName || '未命名视频'"
            @input="onTitleInput(($event.target as HTMLInputElement).value)"
            @blur="flushTitle"
            @keydown.enter="(e) => { (e.target as HTMLInputElement).blur() }"
          />
        </div>

        <!-- 基础信息 -->
        <div class="section">
          <div class="section__title">基础</div>
          <div class="field">
            <label>描述</label>
            <n-input
              :value="form.description ?? ''"
              type="textarea"
              :rows="3"
              placeholder="给视频加个描述吧"
              @update:value="onDescriptionUpdate"
              @blur="flushDescription"
            />
          </div>
          <div class="field">
            <label>可见性</label>
            <n-radio-group :value="form.visibility ?? 'private'" @update:value="onVisibilityChange">
              <n-radio value="private">私密</n-radio>
              <n-radio value="friends">好友</n-radio>
              <n-radio value="public">公开</n-radio>
            </n-radio-group>
          </div>
          <div class="field">
            <label>拍摄时间</label>
            <n-date-picker
              :value="shotAtMs"
              type="datetime"
              clearable
              style="width: 100%;"
              @update:value="onShotAtChange"
            />
          </div>
        </div>

        <!-- 技术元数据：只读展示，由 ffprobe 回写 -->
        <div class="section">
          <div class="section__title">技术信息</div>
          <div class="tech-grid">
            <div class="tech-item"><span class="tech-key">时长</span><span class="tech-val">{{ duration || '—' }}</span></div>
            <div class="tech-item"><span class="tech-key">分辨率</span><span class="tech-val">{{ resolutionFull || '—' }}</span></div>
            <div class="tech-item"><span class="tech-key">文件大小</span><span class="tech-val">{{ fileSizeText || '—' }}</span></div>
            <div class="tech-item"><span class="tech-key">状态</span><span class="tech-val">{{ video.status || '—' }}</span></div>
          </div>
          <div class="tech-item full">
            <span class="tech-key">对象 Key</span>
            <code class="tech-val tech-val--mono">{{ video.objectKey }}</code>
          </div>
        </div>

        <!-- 分类：合集 + 标签 -->
        <div class="section">
          <div class="section__title">分类</div>
          <div class="field">
            <label>合集</label>
            <n-select
              :value="selectedCollectionIds"
              multiple
              filterable
              tag
              clearable
              :options="collectionOptions"
              placeholder="选择合集"
              @update:value="onCollectionsChange"
            />
          </div>
          <div class="field">
            <label>标签</label>
            <n-select
              :value="selectedTagNames"
              multiple
              filterable
              tag
              clearable
              :options="tagOptions"
              placeholder="选择或新建标签（回车）"
              @update:value="onTagsChange"
              :on-create="onTagCreate"
            />
          </div>
        </div>

        <!-- 位置 / 封面帧 用 tabs 折叠避免抽屉太长 -->
        <n-tabs type="line" size="small" :default-value="'location'">
          <n-tab-pane name="location" tab="位置">
            <LocationPicker
              v-if="show"
              v-model="locationModel"
              height="240px"
            />
            <n-flex justify="flex-end" style="margin-top: 8px;">
              <n-button size="small" @click="onLocationSave">保存位置</n-button>
            </n-flex>
          </n-tab-pane>
          <n-tab-pane name="cover" tab="封面帧">
            <p class="hint">点击下方按钮加载视频（默认 720P，转码未完成时会降级到原画），拖动进度条选取一帧作为封面。</p>
            <n-button
              v-if="!showFramePicker"
              size="small"
              :disabled="!hasStream"
              @click="showFramePicker = true"
            >
              {{ hasStream ? '加载视频选封面' : '视频地址未就绪' }}
            </n-button>
            <!-- key 取候选数组的字符串拼接，候选列表变化（例如换了视频）就强制 picker 重建 -->
            <VideoFramePicker
              v-else-if="hasStream"
              :key="streamCandidates.join('|')"
              :sources="streamCandidates"
              @frame-captured="onFrameCaptured"
            />
          </n-tab-pane>
        </n-tabs>
      </div>
    </n-drawer-content>
  </n-drawer>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  NDrawer,
  NDrawerContent,
  NFlex,
  NButton,
  NPopconfirm,
  NInput,
  NRadioGroup,
  NRadio,
  NDatePicker,
  NSelect,
  NTabs,
  NTabPane,
  useMessage,
} from 'naive-ui'
import LocationPicker from '../../components/LocationPicker.vue'
import VideoFramePicker from '../../components/VideoFramePicker.vue'
import type { VideoItem } from '../../api/manager'
import {
  formatDuration,
  formatBytes,
  getCoverPickerCandidates,
} from './composables/videoFormat'
import { useCdnDomain, normalizeCdnOrigin } from './composables/useCdnDomain'
import { useVideoThemeVars } from './composables/useVideoThemeVars'

const cdnDomain = useCdnDomain()
const themeCssVars = useVideoThemeVars()
import { updateVideo } from '../../api/manager'
import { fetchTagsWithVideoId, addTagsToVideo, removeTagsFromVideo, fetchTags, createTag } from '../../api/tags'
import { fetchVideoLocation, updateVideoLocation } from '../../api/location'

const props = defineProps<{
  show: boolean
  video: VideoItem | null
  collections: { id: number; name: string }[]
  /** 抽屉允许翻页时由父组件计算 */
  hasPrev: boolean
  hasNext: boolean
}>()

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void
  (e: 'navigate', delta: -1 | 1): void
  (e: 'open-public'): void
  (e: 'delete'): void
  /** 字段级保存成功后通知父组件刷列表 / patch 列表中的视频对象 */
  (e: 'patched', videoId: number, patch: Partial<VideoItem>): void
  (e: 'collections-changed', videoId: number, collectionIds: number[]): void
}>()

const message = useMessage()

interface LocalForm {
  title: string | null
  description: string | null
  visibility: string | null
  shotAt: string | null
}
const form = ref<LocalForm>({ title: null, description: null, visibility: null, shotAt: null })
const initialForm = ref<LocalForm>({ title: null, description: null, visibility: null, shotAt: null })

const saveStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const saveError = ref('')
const savedAt = ref<Date | null>(null)
const savedAtText = computed(() =>
  savedAt.value ? savedAt.value.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''
)

const showFramePicker = ref(false)

// 标签 / 合集状态：抽屉打开时拉，关闭时清
const selectedTagNames = ref<string[]>([])
const initialTagsRef = ref<{ id: number; name: string }[]>([])
const allTags = ref<{ id: number; name: string }[]>([])
const tagOptions = computed(() => allTags.value.map((t) => ({ label: t.name, value: t.name })))

const selectedCollectionIds = ref<number[]>([])
const collectionOptions = computed(() =>
  props.collections.map((c) => ({ label: c.name, value: c.id }))
)

// 位置（懒加载）
const locationModel = ref<{ lat: number; lng: number } | null>(null)

/**
 * 封面帧选择器的视频源候选列表（按推荐顺序）：720p → 480p → 原画。
 * 用 720p 而非原画：原画动辄 200MB 以上拉满带宽抓帧很慢，720p 已经够覆盖大多数封面用例。
 * 让 picker 内部按 onerror 顺次降级，转码未完成的视频也能用最后的原画。
 */
const streamCandidates = computed(() =>
  props.video?.objectKey
    ? getCoverPickerCandidates(props.video.objectKey, normalizeCdnOrigin(cdnDomain.value))
    : []
)
const hasStream = computed(() => streamCandidates.value.length > 0)

// 派生展示
const duration = computed(() => formatDuration(props.video?.durationMs))
const resolutionFull = computed(() => {
  const v = props.video
  if (!v?.width || !v?.height) return ''
  return `${v.width} × ${v.height}`
})
const fileSizeText = computed(() => formatBytes(props.video?.fileSize))

const shotAtMs = computed<number | null>(() => {
  if (!form.value.shotAt) return null
  const t = Date.parse(form.value.shotAt)
  return Number.isFinite(t) ? t : null
})

/**
 * 当 video 切换或抽屉打开时，重置表单 + 重新拉关联数据。
 * 用 video.id 触发，避免父对象引用变化导致重复加载。
 */
watch(
  () => [props.show, props.video?.id] as const,
  async ([show, _id]) => {
    if (!show || !props.video) return
    const v = props.video
    form.value = {
      title: v.title ?? '',
      description: v.description ?? '',
      visibility: v.visibility ?? 'private',
      shotAt: v.shotAt ?? null,
    }
    initialForm.value = { ...form.value }
    saveStatus.value = 'idle'
    showFramePicker.value = false

    selectedCollectionIds.value = (v.collections ?? []).map((c) => c.id)

    try {
      const [tagsForVideo, allTagList, loc] = await Promise.all([
        fetchTagsWithVideoId(v.id),
        fetchTags({ pageSize: 200 }),
        fetchVideoLocation(v.uuid),
      ])
      initialTagsRef.value = tagsForVideo as any
      selectedTagNames.value = (tagsForVideo as any[]).map((t) => t.name)
      allTags.value = (allTagList as any) ?? []
      locationModel.value = loc ? { lat: loc.latitude, lng: loc.longitude } : null
    } catch (err) {
      console.warn('加载视频关联数据失败', err)
    }
  },
  { immediate: false }
)

let titleTimer: number | null = null
function onTitleInput(v: string) {
  form.value.title = v
  if (titleTimer) window.clearTimeout(titleTimer)
  titleTimer = window.setTimeout(() => flushTitle(), 600)
}
function flushTitle() {
  if (titleTimer) {
    window.clearTimeout(titleTimer)
    titleTimer = null
  }
  if (form.value.title === initialForm.value.title) return
  saveField({ title: form.value.title })
}

let descTimer: number | null = null
function onDescriptionUpdate(v: string) {
  form.value.description = v
  if (descTimer) window.clearTimeout(descTimer)
  descTimer = window.setTimeout(() => flushDescription(), 800)
}
function flushDescription() {
  if (descTimer) {
    window.clearTimeout(descTimer)
    descTimer = null
  }
  if (form.value.description === initialForm.value.description) return
  saveField({ description: form.value.description })
}

function onVisibilityChange(v: string) {
  form.value.visibility = v
  if (v === initialForm.value.visibility) return
  saveField({ visibility: v })
}

function onShotAtChange(ms: number | null) {
  form.value.shotAt = ms == null ? null : new Date(ms).toISOString()
  saveField({ shotAt: form.value.shotAt })
}

/**
 * 字段级 patch：只发送当前字段，UI 立即标记已保存。
 * 失败时回滚 initialForm 与表单数据，让用户清楚知道"没保存上"。
 */
async function saveField(patch: Partial<LocalForm>) {
  if (!props.video) return
  const id = props.video.id
  saveStatus.value = 'saving'
  saveError.value = ''
  try {
    await updateVideo(id, {
      title: patch.title ?? form.value.title ?? '',
      description: patch.description ?? form.value.description ?? '',
      shotAt: patch.shotAt ?? form.value.shotAt ?? null,
      visibility: patch.visibility ?? form.value.visibility ?? null,
    })
    initialForm.value = { ...form.value }
    saveStatus.value = 'saved'
    savedAt.value = new Date()
    emit('patched', id, {
      title: form.value.title,
      description: form.value.description,
      visibility: form.value.visibility,
      shotAt: form.value.shotAt,
    })
  } catch (err: any) {
    saveStatus.value = 'error'
    saveError.value = err?.message ?? '未知错误'
  }
}

async function onCollectionsChange(ids: number[]) {
  if (!props.video) return
  selectedCollectionIds.value = ids
  emit('collections-changed', props.video.id, ids)
}

async function onTagsChange(names: string[]) {
  if (!props.video) return
  const before = new Set(initialTagsRef.value.map((t) => t.name))
  const after = new Set(names)
  // 计算 add / remove
  const toAddNames = names.filter((n) => !before.has(n))
  const toRemoveTags = initialTagsRef.value.filter((t) => !after.has(t.name))

  selectedTagNames.value = names
  try {
    // 新名字若不在 allTags 里，先创建拿 id
    const idsToAdd: number[] = []
    for (const n of toAddNames) {
      const exist = allTags.value.find((t) => t.name === n)
      if (exist) {
        idsToAdd.push(exist.id)
      } else {
        const created: any = await createTag({ name: n })
        if (created?.id) {
          idsToAdd.push(created.id)
          allTags.value.push({ id: created.id, name: created.name ?? n })
        }
      }
    }
    if (idsToAdd.length > 0) {
      await addTagsToVideo({ tagIds: idsToAdd, videoId: props.video.id })
    }
    if (toRemoveTags.length > 0) {
      await removeTagsFromVideo({ tagIds: toRemoveTags.map((t) => t.id), videoId: props.video.id })
    }
    // 更新 initial 引用
    initialTagsRef.value = names.map((n) => {
      return allTags.value.find((t) => t.name === n) ?? { id: -1, name: n }
    })
  } catch (err: any) {
    message.error(`标签更新失败：${err?.message ?? '未知错误'}`)
  }
}

/**
 * n-select 的 onCreate 必须返回 SelectOption 形态。这里只在 UI 层创建选项，
 * 真正落库（调 createTag）走 onTagsChange — 那里在 add 时会按需创建。
 */
function onTagCreate(label: string) {
  return { label, value: label }
}

/**
 * 用户在 VideoFramePicker 里点了"使用此帧"。
 *
 * 当前不直接走"上传新封面"的端到端：
 *  - 后端目前的封面机制是 worker 在转码时主动选第一帧 + 上传 R2 + 写 video_images 关系；
 *  - 用户手动改封面需要新接口（dataURL → R2 → 更新 video_images.usage='cover'），
 *    属于另一个 PR 的范畴。
 *
 * 在那之前，先把抓到的帧本地预览出来给用户确认，避免功能"完全感觉不到"。
 * 后续接入正式接口时直接在这里替换为 API 调用即可，UI 不用动。
 */
async function onFrameCaptured(dataUrl: string, atSec: number) {
  message.info(`已抓取到第 ${atSec.toFixed(1)}s 的帧（暂未接入封面替换接口）`)
  // 占位：未来调 uploadCustomCover(videoId, dataUrl) 之类
  void dataUrl
}

async function onLocationSave() {
  if (!props.video || !locationModel.value) return
  try {
    await updateVideoLocation(props.video.uuid, {
      longitude: locationModel.value.lng,
      latitude: locationModel.value.lat,
    })
    message.success('位置已保存')
  } catch (err: any) {
    message.error(`位置保存失败：${err?.message ?? '未知错误'}`)
  }
}
</script>

<style scoped>
.drawer-title {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.drawer-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
/* 封面区永远是深底（视频缩略图天然黑底）；占位文字白字 OK */
.drawer-cover {
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 8px;
  overflow: hidden;
  background: #0e0e12;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.06);
}
.drawer-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.drawer-cover__placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.55);
  font-size: 12px;
}

.title-edit__input {
  width: 100%;
  background: transparent;
  border: none;
  border-bottom: 1px solid transparent;
  font-size: 18px;
  font-weight: 600;
  color: var(--n-text-color);
  padding: 4px 0;
  outline: none;
  transition: border-color 0.15s ease;
}
/* 用 divider token：浅色下淡灰、深色下淡白都能看见 */
.title-edit__input:hover {
  border-bottom-color: var(--n-divider-color);
}
.title-edit__input:focus {
  border-bottom-color: var(--n-primary-color);
}

.section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.section__title {
  font-size: 11px;
  font-weight: 700;
  color: var(--n-text-color-3);
  letter-spacing: 0.8px;
  margin-bottom: 4px;
  text-transform: uppercase;
  display: flex;
  align-items: center;
  gap: 8px;
}
/* 标题后接一条细线，呼应主流编辑器 sidebar 分组样式 */
.section__title::after {
  content: '';
  flex: 1 1 auto;
  height: 1px;
  background: var(--n-divider-color);
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.field label {
  font-size: 12px;
  color: var(--n-text-color-2);
}

.tech-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 16px;
  padding: 10px 12px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--n-text-color) 4%, transparent);
}
.tech-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.tech-item.full {
  grid-column: 1 / -1;
  margin-top: 4px;
}
.tech-key {
  font-size: 10px;
  color: var(--n-text-color-3);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.tech-val {
  font-size: 13px;
  color: var(--n-text-color);
  word-break: break-all;
  font-variant-numeric: tabular-nums;
}
.tech-val--mono {
  font-family: 'JetBrains Mono', 'Consolas', 'Menlo', monospace;
  font-size: 11px;
  background: var(--n-card-color);
  border: 1px solid var(--n-divider-color);
  color: var(--n-text-color-2);
  padding: 4px 6px;
  border-radius: 4px;
}

.save-status {
  font-size: 11px;
  color: var(--n-text-color-3);
}

.hint {
  font-size: 12px;
  color: var(--n-text-color-3);
  margin: 0 0 8px 0;
}
</style>
