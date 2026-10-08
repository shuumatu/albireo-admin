<template>
  <n-drawer
    :show="show"
    width="min(540px, 100vw)"
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
          <span style="flex: 1 1 auto;" />
          <n-button
            v-if="video && (!video.status || video.status === 'done')"
            size="small"
            quaternary
            type="primary"
            @click="$emit('share', video)"
            title="分享这个视频"
          >
            <template #icon>
              <svg viewBox="0 0 24 24" width="14" height="14">
                <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92S19.61 16.08 18 16.08z" fill="currentColor"/>
              </svg>
            </template>
            分享
          </n-button>
        </n-flex>
      </template>

      <template #footer>
        <n-flex justify="space-between" align="center" style="width: 100%;">
          <span class="save-status" role="status" aria-live="polite">
            <span v-if="saveStatus === 'saving'">保存中…</span>
            <span v-else-if="saveStatus === 'saved'">已保存于 {{ savedAtText }}</span>
            <span v-else-if="saveStatus === 'error'" style="color: var(--n-error-color);">保存失败：{{ saveError }} <n-button text size="tiny" type="error" @click="saveField({ ...form })">重试</n-button></span>
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
          <MediaImage :renditions="video?.renditions" v-if="video.coverUrl" :src="video.coverUrl" :alt="video.fileName" fit="contain" />
          <div v-else class="drawer-cover__placeholder">无封面</div>
        </div>

        <!-- 基础信息 -->
        <div class="section">
          <div class="section__title">基础</div>
          <!--
            标题独立成一个明显的输入框（带 label）。
            过去做成「默认像普通文字 hover 出下划线」太隐蔽，
            用户根本意识不到能编辑，这里和「描述」等字段对齐为标准 n-input。
          -->
          <div class="field">
            <label>标题</label>
            <n-input
              :value="form.title ?? ''"
              :placeholder="video.fileName || '未命名视频'"
              clearable
              @update:value="onTitleInput"
              @blur="flushTitle"
              @keydown.enter="(e: any) => { (e?.target as HTMLInputElement)?.blur() }"
            />
          </div>
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
              clearable
              :loading="collectionsSaving"
              :disabled="collectionsSaving"
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
              :loading="tagsLoading || tagsSaving"
              :disabled="tagsLoading || tagsSaving || !!tagsError"
              :options="tagOptions"
              placeholder="选择或新建标签（回车）"
              @update:value="onTagsChange"
              :on-create="onTagCreate"
            />
            <p v-if="tagsError" class="hint" role="alert">{{ tagsError }} <n-button text size="small" type="primary" @click="loadTags">重新加载</n-button></p>
          </div>
        </div>

        <!-- 位置 / 封面帧 用 tabs 折叠避免抽屉太长 -->
        <div ref="tabsAnchor">
        <n-tabs v-model:value="activeTab" type="line" size="small">
          <n-tab-pane name="location" tab="位置">
            <p v-if="locationLoading" class="hint" role="status">正在加载位置…</p>
            <p v-else-if="locationError" class="hint" role="alert">{{ locationError }} <n-button text size="small" type="primary" @click="loadLocation">重新加载</n-button></p>
            <LocationPicker
              v-if="show && !locationLoading && !locationError"
              v-model="locationModel"
              height="420px"
            />
            <n-flex justify="flex-end" style="margin-top: 8px;">
              <n-button size="small" :loading="locationSaving" :disabled="locationLoading || !!locationError || !locationModel" @click="onLocationSave">保存位置</n-button>
            </n-flex>
          </n-tab-pane>
          <n-tab-pane name="cover" tab="视频截帧">
            <p class="hint">加载视频后拖动进度条截取画面，可将截图保存到本地。视频封面由处理流程自动生成。</p>
            <n-button
              v-if="!showFramePicker"
              size="small"
              :disabled="!hasStream"
              @click="showFramePicker = true"
            >
              {{ hasStream ? '加载视频并截帧' : '视频地址未就绪' }}
            </n-button>
            <!-- key 取候选数组的字符串拼接，候选列表变化（例如换了视频）就强制 picker 重建 -->
            <VideoFramePicker
              confirm-label="保存截图"
              v-else-if="hasStream"
              :key="streamCandidates.join('|')"
              :sources="streamCandidates"
              @frame-captured="onFrameCaptured"
            />
          </n-tab-pane>
        </n-tabs>
        </div>
      </div>
    </n-drawer-content>
  </n-drawer>
</template>

<script setup lang="ts">
import MediaImage from '../../components/MediaImage.vue'

import { computed, ref, watch, nextTick, onBeforeUnmount } from 'vue'
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
} from './composables/videoFormat'
import { useVideoThemeVars } from './composables/useVideoThemeVars'

const themeCssVars = useVideoThemeVars()
import { updateVideo } from '../../api/manager'
import { fetchTagsWithVideoId, addTagsToVideo, removeTagsFromVideo, fetchTags, createTag } from '../../api/tags'
import { fetchVideoLocation, updateVideoLocation } from '../../api/location'

const props = defineProps<{
  show: boolean
  video: VideoItem | null
  collections: { id: number; name: string }[]
  collectionsSaving?: boolean
  initialTab?: 'location' | 'cover'
  /** 抽屉允许翻页时由父组件计算 */
  hasPrev: boolean
  hasNext: boolean
}>()

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void
  (e: 'navigate', delta: -1 | 1): void
  (e: 'open-public'): void
  (e: 'delete'): void
  (e: 'share', video: VideoItem): void
  /** 字段级保存成功后通知父组件刷列表 / patch 列表中的视频对象 */
  (e: 'patched', videoId: number, patch: Partial<VideoItem>): void
  (e: 'collections-changed', videoId: number, collectionIds: number[]): void
}>()

const message = useMessage()

interface LocalForm {
  title: string
  description: string
  visibility: string | null
  shotAt: string | null
}
const form = ref<LocalForm>({ title: '', description: '', visibility: null, shotAt: null })
const initialForm = ref<LocalForm>({ title: '', description: '', visibility: null, shotAt: null })

const saveStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const saveError = ref('')
const savedAt = ref<Date | null>(null)
const savedAtText = computed(() =>
  savedAt.value ? savedAt.value.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''
)

const showFramePicker = ref(false)
const activeTab = ref<'location' | 'cover'>('location')
const tabsAnchor = ref<HTMLElement | null>(null)
let drawerGeneration = 0
let disposed = false
function isCurrent(id: number, generation: number) {
  return !disposed && props.show && props.video?.id === id && drawerGeneration === generation
}
async function resetTab() {
  activeTab.value = props.initialTab ?? 'location'
  if (activeTab.value === 'cover' && props.show) {
    const generation = drawerGeneration
    await nextTick()
    if (generation === drawerGeneration && props.show) tabsAnchor.value?.scrollIntoView({ block: 'start', behavior: 'auto' })
  }
}
watch(() => props.initialTab, resetTab)

// 标签 / 合集状态：抽屉打开时拉，关闭时清
const selectedTagNames = ref<string[]>([])
const initialTagsRef = ref<{ id: number; name: string }[]>([])
const allTags = ref<{ id: number; name: string }[]>([])
const tagsLoading = ref(false)
const tagsError = ref('')
const tagSaveIds = ref(new Set<number>())
const tagsSaving = computed(() => props.video != null && tagSaveIds.value.has(props.video.id))
const tagOptions = computed(() => allTags.value.map((t) => ({ label: t.name, value: t.name })))

const selectedCollectionIds = ref<number[]>([])
const collectionOptions = computed(() =>
  props.collections.map((c) => ({ label: c.name, value: c.id }))
)

// 位置（懒加载）
const locationModel = ref<{ lat: number; lng: number } | null>(null)
const locationLoading = ref(false)
const locationError = ref('')
const locationSaveIds = ref(new Set<number>())
const locationSaving = computed(() => props.video != null && locationSaveIds.value.has(props.video.id))

watch(() => [props.video?.collections, props.collectionsSaving] as const, () => {
  if (!props.collectionsSaving) selectedCollectionIds.value = (props.video?.collections ?? []).map(c => c.id)
}, { deep: true })

// 只使用后端登记并授权的播放地址。
const streamCandidates = computed(() => [
  ...(props.video?.analysisUrl ? [props.video.analysisUrl] : []),
  ...(props.video?.videoVersions ?? []).filter(v => v.status === 'done' && v.url).map(v => v.url!),
  ...(props.video?.sourceUrl ? [props.video.sourceUrl] : []),
])
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
let titleTimer: number | null = null
let descTimer: number | null = null
let saveQueue: Promise<void> = Promise.resolve()
const fieldSaveStates = new Map<number, { pending: number; errors: Map<string, string>; savedAt: Date | null; queued: Partial<LocalForm> }>()
function fieldNeedsSave(field: keyof LocalForm, id = props.video?.id) {
  const state = id == null ? undefined : fieldSaveStates.get(id)
  const baseline = state?.pending && Object.prototype.hasOwnProperty.call(state.queued, field)
    ? state.queued[field] : initialForm.value[field]
  return form.value[field] !== baseline
}

/**
 * 当 video 切换或抽屉打开时，重置表单 + 重新拉关联数据。
 * 用 video.id 触发，避免父对象引用变化导致重复加载。
 */
watch(
  [() => props.show, () => props.video?.id],
  ([show, _id], previous) => {
    if (previous?.[0] && previous[1] != null) {
      const patch: Partial<LocalForm> = {}
      if (fieldNeedsSave('title', previous[1])) patch.title = form.value.title
      if (fieldNeedsSave('description', previous[1])) patch.description = form.value.description
      if (Object.keys(patch).length) void saveField(patch, previous[1])
    }
    if (titleTimer) window.clearTimeout(titleTimer)
    if (descTimer) window.clearTimeout(descTimer)
    titleTimer = descTimer = null
    drawerGeneration++
    selectedTagNames.value = []
    initialTagsRef.value = []
    allTags.value = []
    tagsLoading.value = false
    tagsError.value = ''
    locationModel.value = null
    locationLoading.value = false
    locationError.value = ''
    if (!show || !props.video) return
    const v = props.video
    form.value = {
      title: v.title ?? '',
      description: v.description ?? '',
      visibility: v.visibility === 'public' ? 'public' : 'private',
      shotAt: v.shotAt ?? null,
    }
    initialForm.value = { ...form.value }
    form.value = { ...form.value, ...fieldSaveStates.get(v.id)?.queued }
    saveStatus.value = 'idle'
    refreshSaveStatus(v.id)
    showFramePicker.value = false
    void resetTab()

    selectedCollectionIds.value = (v.collections ?? []).map((c) => c.id)

    void loadTags()
    void loadLocation()
  },
  { immediate: true }
)

async function loadTags() {
  if (!props.video || tagsLoading.value || tagsSaving.value) return
  const id = props.video.id
  const generation = drawerGeneration
  tagsLoading.value = true
  tagsError.value = ''
  try {
    const [tags, options] = await Promise.all([fetchTagsWithVideoId(id), fetchTags({ pageSize: 200 })])
    if (!isCurrent(id, generation)) return
    initialTagsRef.value = tags ?? []
    selectedTagNames.value = initialTagsRef.value.map(t => t.name)
    allTags.value = [...new Map([...(options ?? []), ...initialTagsRef.value].map(tag => [tag.name, tag])).values()]
  } catch (err: any) {
    if (isCurrent(id, generation)) tagsError.value = `标签加载失败：${err?.message ?? '请重试'}`
  } finally {
    if (isCurrent(id, generation)) tagsLoading.value = false
  }
}

async function loadLocation() {
  if (!props.video || locationLoading.value || locationSaving.value) return
  const { id, uuid } = props.video
  const generation = drawerGeneration
  locationLoading.value = true
  locationError.value = ''
  try {
    const loc = await fetchVideoLocation(uuid)
    if (isCurrent(id, generation)) locationModel.value = loc ? { lat: loc.latitude, lng: loc.longitude } : null
  } catch (err: any) {
    if (isCurrent(id, generation)) locationError.value = `位置加载失败：${err?.message ?? '请重试'}`
  } finally {
    if (isCurrent(id, generation)) locationLoading.value = false
  }
}

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
  if (!fieldNeedsSave('title')) return
  saveField({ title: form.value.title })
}

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
  if (!fieldNeedsSave('description')) return
  saveField({ description: form.value.description })
}

function onVisibilityChange(v: string) {
  form.value.visibility = v
  if (!fieldNeedsSave('visibility')) return
  saveField({ visibility: v })
}

function onShotAtChange(ms: number | null) {
  form.value.shotAt = ms == null ? null : new Date(ms).toISOString()
  saveField({ shotAt: form.value.shotAt })
}

/**
 * 顺序提交字段快照，全部请求完成后再显示保存结果；失败字段保留以便重试。
 */
function refreshSaveStatus(id: number) {
  if (disposed || !props.show || props.video?.id !== id) return
  const state = fieldSaveStates.get(id)
  if (!state) return
  saveStatus.value = state.pending ? 'saving' : state.errors.size ? 'error' : 'saved'
  saveError.value = [...state.errors.values()][0] ?? ''
  savedAt.value = state.savedAt
}
async function saveField(patch: Partial<LocalForm>, id = props.video?.id) {
  if (id == null) return
  const snapshot = { ...patch }
  const state = fieldSaveStates.get(id) ?? { pending: 0, errors: new Map<string, string>(), savedAt: null, queued: {} }
  fieldSaveStates.set(id, state)
  state.queued = { ...state.queued, ...snapshot }
  state.pending++
  refreshSaveStatus(id)
  saveQueue = saveQueue.then(async () => {
    try {
      await updateVideo(id, snapshot)
      emit('patched', id, snapshot)
      for (const field of Object.keys(snapshot)) state.errors.delete(field)
      state.savedAt = new Date()
      if (disposed || props.video?.id !== id || !props.show) return
      initialForm.value = { ...initialForm.value, ...snapshot }
    } catch (err: any) {
      for (const field of Object.keys(snapshot)) state.errors.set(field, err?.message ?? '未知错误')
      if (!disposed && (props.video?.id !== id || !props.show)) {
        message.error(`保存失败：${err?.message ?? '未知错误'}`)
      }
    } finally {
      state.pending--
      if (!state.pending) {
        state.queued = Object.fromEntries(Object.entries(state.queued).filter(([field]) => state.errors.has(field)))
      }
      refreshSaveStatus(id)
    }
  })
  await saveQueue
}

onBeforeUnmount(() => {
  flushTitle()
  flushDescription()
  disposed = true
  drawerGeneration++
})

async function onCollectionsChange(ids: number[]) {
  if (!props.video || props.collectionsSaving) return
  selectedCollectionIds.value = [...ids]
  emit('collections-changed', props.video.id, [...ids])
}

async function onTagsChange(names: string[]) {
  if (!props.video || tagsLoading.value || tagsSaving.value || tagsError.value) return
  const videoId = props.video.id
  const generation = drawerGeneration
  const options = [...allTags.value]
  const before = new Set(initialTagsRef.value.map((t) => t.name))
  const after = new Set(names)
  // 计算 add / remove
  const toAddNames = names.filter((n) => !before.has(n))
  const toRemoveTags = initialTagsRef.value.filter((t) => !after.has(t.name))

  selectedTagNames.value = [...names]
  tagSaveIds.value.add(videoId)
  try {
    // 新名字若不在 allTags 里，先创建拿 id
    const idsToAdd: number[] = []
    for (const n of toAddNames) {
      const exist = options.find((t) => t.name === n)
      if (exist) {
        idsToAdd.push(exist.id)
      } else {
        const created: any = await createTag({ name: n })
        if (created?.id) {
          idsToAdd.push(created.id)
          options.push({ id: created.id, name: created.name ?? n })
        } else {
          throw new Error('新建标签未返回有效 ID')
        }
      }
    }
    if (idsToAdd.length > 0) {
      await addTagsToVideo({ tagIds: idsToAdd, videoId })
    }
    if (toRemoveTags.length > 0) {
      await removeTagsFromVideo({ tagIds: toRemoveTags.map((t) => t.id), videoId })
    }
    // 更新 initial 引用
    if (isCurrent(videoId, generation)) {
      allTags.value = options
      initialTagsRef.value = names.map(n => options.find(t => t.name === n)!)
    }
  } catch (err: any) {
    if (!disposed) message.error(`视频标签更新失败：${err?.message ?? '未知错误'}`)
  } finally {
    tagSaveIds.value.delete(videoId)
    if (!disposed && props.show && props.video?.id === videoId) void loadTags()
  }
}

/**
 * n-select 的 onCreate 必须返回 SelectOption 形态。这里只在 UI 层创建选项，
 * 真正落库（调 createTag）走 onTagsChange — 那里在 add 时会按需创建。
 */
function onTagCreate(label: string) {
  return { label, value: label }
}

function onFrameCaptured(dataUrl: string, atSec: number) {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = `video-${props.video?.id ?? 'frame'}-${atSec.toFixed(2)}s.jpg`
  document.body.append(link)
  link.click()
  link.remove()
  message.success('截图已准备下载')
}

async function onLocationSave() {
  if (!props.video || !locationModel.value || locationLoading.value || locationSaving.value || locationError.value) return
  const { id, uuid } = props.video
  const generation = drawerGeneration
  const payload = { longitude: locationModel.value.lng, latitude: locationModel.value.lat }
  locationSaveIds.value.add(id)
  try {
    await updateVideoLocation(uuid, payload)
    if (isCurrent(id, generation)) message.success('位置已保存')
  } catch (err: any) {
    if (!disposed) message.error(`位置保存失败：${err?.message ?? '未知错误'}`)
  } finally {
    locationSaveIds.value.delete(id)
    if (!disposed && props.show && props.video?.id === id && generation !== drawerGeneration) void loadLocation()
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
  background: #000;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.06);
}
.drawer-cover :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: contain;
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
