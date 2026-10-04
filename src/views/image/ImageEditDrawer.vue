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
      n-drawer 走 Teleport，drawer 整棵子树离开了 .image-list-page，
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
            title="上一张 (↑)"
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
            title="下一张 (↓)"
          >
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path d="M10 7v10l5-5z" fill="currentColor" />
            </svg>
          </n-button>
          <span class="drawer-title">{{ image?.title || image?.fileName || '图片详情' }}</span>
          <span style="flex: 1 1 auto;" />
          <n-button
            v-if="image"
            size="small"
            quaternary
            type="primary"
            @click="$emit('share', image)"
            title="分享这张图片"
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
            <n-popconfirm @positive-click="$emit('delete')">
              <template #trigger>
                <n-button size="small" type="error" tertiary>删除</n-button>
              </template>
              确定删除该图片？此操作不可恢复。
            </n-popconfirm>
          </n-flex>
        </n-flex>
      </template>

      <div v-if="image" class="drawer-body">
        <!-- 顶部：缩略图 -->
        <div class="drawer-cover">
          <img v-if="!coverFailed && cover" :src="cover" :alt="image.fileName" @error="coverFailed = true" />
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
              :placeholder="image.fileName || '未命名图片'"
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
              placeholder="给图片加个描述吧"
              @update:value="onDescriptionUpdate"
              @blur="flushDescription"
            />
          </div>
          <div class="field">
            <label>类型</label>
            <n-radio-group :value="form.type ?? 'photo'" @update:value="onTypeChange">
              <n-radio value="photo">照片</n-radio>
              <n-radio value="cover">封面</n-radio>
              <n-radio value="other">其他</n-radio>
            </n-radio-group>
          </div>
          <div class="field">
            <label>可见性</label>
            <n-radio-group :value="form.visibility" @update:value="onVisibilityChange">
              <n-radio value="private">私密</n-radio>
              <n-radio value="public">公开</n-radio>
            </n-radio-group>
            <p class="hint">公开后，处理完成的照片可被访客浏览；私密内容仅管理员或有效分享可访问。</p>
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

        <!-- 技术元数据：只读展示 -->
        <div class="section">
          <div class="section__title">技术信息</div>
          <div class="tech-grid">
            <div class="tech-item"><span class="tech-key">状态</span><span class="tech-val">{{ image.status || '—' }}</span></div>
            <div class="tech-item"><span class="tech-key">UUID</span><span class="tech-val">{{ image.uuid || '—' }}</span></div>
            <div class="tech-item"><span class="tech-key">文件名</span><span class="tech-val">{{ image.fileName || '—' }}</span></div>
            <div class="tech-item"><span class="tech-key">创建时间</span><span class="tech-val">{{ createdAtText || '—' }}</span></div>
          </div>
        </div>

        <!-- 分类：合集 -->
        <div class="section">
          <div class="section__title">分类</div>
          <div class="field">
            <label>合集</label>
            <n-select
              :value="selectedCollectionIds"
              multiple
              filterable
              clearable
              :loading="collectionsLoading || collectionsSaving"
              :disabled="collectionsLoading || collectionsSaving || !!collectionsError"
              :options="collectionOptions"
              placeholder="选择合集"
              @update:value="onCollectionsChange"
            />
            <p v-if="collectionsError" class="hint" role="alert">{{ collectionsError }} <n-button text size="small" type="primary" @click="loadCollections">重新加载</n-button></p>
          </div>
        </div>

        <!-- 位置 / EXIF 用 tabs 折叠避免抽屉太长 -->
        <n-tabs type="line" size="small" :default-value="'location'">
          <n-tab-pane name="location" tab="位置">
            <p v-if="locationError" class="hint" role="alert">{{ locationError }}</p>
            <p v-if="!locationLoaded" class="hint">点击下方按钮加载该图片的 GPS 位置（无位置时可在地图上自行选点）。</p>
            <n-button
              v-if="!locationLoaded"
              size="small"
              :loading="locationLoading"
              :disabled="locationSaving"
              @click="ensureLocationLoaded"
            >
              加载位置
            </n-button>
            <template v-else>
              <LocationPicker
                v-if="show"
                v-model="locationModel"
                height="420px"
              />
              <n-flex justify="flex-end" style="margin-top: 8px;">
                <n-button size="small" :loading="locationSaving" :disabled="locationLoading || !locationModel" @click="onLocationSave">保存位置</n-button>
              </n-flex>
            </template>
          </n-tab-pane>
          <n-tab-pane name="exif" tab="EXIF">
            <p v-if="exifError" class="hint" role="alert">{{ exifError }}</p>
            <p v-if="!exifLoaded" class="hint">点击下方按钮加载摄影元数据；尚无数据时可直接填写后保存。</p>
            <n-button
              v-if="!exifLoaded"
              size="small"
              :loading="exifLoading"
              :disabled="exifSaving"
              @click="ensureExifLoaded"
            >
              加载 EXIF
            </n-button>
            <template v-else>
              <ExifEditor v-model="exifData" :loading="exifLoading" />
              <n-flex justify="flex-end" style="margin-top: 8px;">
                <n-button size="small" :loading="exifSaving" type="primary" @click="onExifSave">保存 EXIF</n-button>
              </n-flex>
            </template>
          </n-tab-pane>
        </n-tabs>
      </div>
    </n-drawer-content>
  </n-drawer>
</template>

<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue'
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
import ExifEditor from '../../components/ExifEditor.vue'
import type { ImageItem } from '../../api/images'
import { updateImage, addImagesToCollections, removeImagesFromCollections, fetchCollectionsWithImageId } from '../../api/images'
import { fetchImageLocation, updateImageLocation } from '../../api/location'
import { fetchImageExif, updateImageExif, type ExifData } from '../../api/exif'
import { useVideoThemeVars } from '../video/composables/useVideoThemeVars'

const themeCssVars = useVideoThemeVars()

const props = defineProps<{
  show: boolean
  image: ImageItem | null
  collections: { id: number; name: string }[]
  /** 抽屉允许翻页时由父组件计算 */
  hasPrev: boolean
  hasNext: boolean
}>()

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void
  (e: 'navigate', delta: -1 | 1): void
  (e: 'delete'): void
  (e: 'share', image: ImageItem): void
  /** 字段级保存成功后通知父组件 patch 列表中的图片对象 */
  (e: 'patched', imageId: number, patch: Partial<ImageItem>): void
  (e: 'collections-changed', imageId: number, collectionIds: number[]): void
}>()

const message = useMessage()

interface LocalForm {
  visibility: 'private' | 'public'
  title: string
  description: string
  type: string
  shotAt: string | null
}
const form = ref<LocalForm>({ visibility: 'private', title: '', description: '', type: 'photo', shotAt: null })
const initialForm = ref<LocalForm>({ visibility: 'private', title: '', description: '', type: 'photo', shotAt: null })

const saveStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const saveError = ref('')
const savedAt = ref<Date | null>(null)
const savedAtText = computed(() =>
  savedAt.value ? savedAt.value.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''
)

const coverFailed = ref(false)
const cover = computed(() => props.image?.mediumUrl || props.image?.thumbnailUrl || props.image?.imageUrl)

const createdAtText = computed(() => {
  if (!props.image?.createdAt) return ''
  const d = new Date(props.image.createdAt)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('zh-CN')
})

// ---------- 合集状态 ----------
const selectedCollectionIds = ref<number[]>([])
const initialCollectionIds = ref<number[]>([])
const collectionsLoading = ref(false)
const collectionsError = ref('')
const collectionSaveIds = ref(new Set<number>())
const collectionsSaving = computed(() => props.image != null && collectionSaveIds.value.has(props.image.id))
const collectionOptions = computed(() =>
  props.collections.map((c) => ({ label: c.name, value: c.id }))
)

// ---------- 位置（懒加载） ----------
const locationLoaded = ref(false)
const locationLoading = ref(false)
const locationSaveIds = ref(new Set<number>())
const locationSaving = computed(() => props.image != null && locationSaveIds.value.has(props.image.id))
const locationError = ref('')
const locationModel = ref<{ lat: number; lng: number } | null>(null)

// ---------- EXIF（懒加载） ----------
const exifLoaded = ref(false)
const exifLoading = ref(false)
const exifSaveIds = ref(new Set<number>())
const exifSaving = computed(() => props.image != null && exifSaveIds.value.has(props.image.id))
const exifError = ref('')
const exifData = ref<ExifData>({})
let drawerGeneration = 0
let disposed = false
function isCurrent(id: number, generation: number) {
  return !disposed && props.show && props.image?.id === id && drawerGeneration === generation
}

const shotAtMs = computed<number | null>(() => {
  if (!form.value.shotAt) return null
  const t = Date.parse(form.value.shotAt)
  return Number.isFinite(t) ? t : null
})
let titleTimer: number | null = null
let descTimer: number | null = null
let saveQueue: Promise<void> = Promise.resolve()
const fieldSaveStates = new Map<number, { pending: number; errors: Map<string, string>; savedAt: Date | null; queued: Partial<LocalForm> }>()
function fieldNeedsSave(field: keyof LocalForm, id = props.image?.id) {
  const state = id == null ? undefined : fieldSaveStates.get(id)
  const baseline = state?.pending && Object.prototype.hasOwnProperty.call(state.queued, field)
    ? state.queued[field] : initialForm.value[field]
  return form.value[field] !== baseline
}

/**
 * 当 image 切换或抽屉打开时，重置表单 + 重新拉关联数据。
 * 用 image.id 触发，避免父对象引用变化导致重复加载。
 * 合集数据改用 fetchCollectionsWithImageId（与 props.image.collections 同源备份）：
 * 后端老数据 props.image.collections 可能为 null，必须主动拉一次保证编辑准确。
 */
watch(
  [() => props.show, () => props.image?.id],
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
    locationLoaded.value = false
    locationLoading.value = false
    locationError.value = ''
    locationModel.value = null
    exifLoaded.value = false
    exifLoading.value = false
    exifError.value = ''
    exifData.value = {}
    selectedCollectionIds.value = []
    initialCollectionIds.value = []
    collectionsLoading.value = false
    collectionsError.value = ''
    if (!show || !props.image) return
    const v = props.image
    form.value = {
      visibility: v.visibility ?? 'private',
      title: v.title ?? '',
      description: v.description ?? '',
      type: v.type ?? 'photo',
      shotAt: v.shotAt ?? null,
    }
    initialForm.value = { ...form.value }
    form.value = { ...form.value, ...fieldSaveStates.get(v.id)?.queued }
    saveStatus.value = 'idle'
    refreshSaveStatus(v.id)
    coverFailed.value = false

    // 合集：优先用 props 上挂的，没有就调接口补一次
    if (v.collections && v.collections.length >= 0) {
      selectedCollectionIds.value = v.collections.map((c) => c.id)
      initialCollectionIds.value = [...selectedCollectionIds.value]
    } else {
      void loadCollections()
    }
  },
  { immediate: true }
)

async function loadCollections() {
  if (!props.image || collectionsLoading.value || collectionsSaving.value) return
  const id = props.image.id
  const generation = drawerGeneration
  collectionsLoading.value = true
  collectionsError.value = ''
  try {
    const res = await fetchCollectionsWithImageId(id)
    if (!isCurrent(id, generation)) return
    const ids = (res.data ?? []).map(c => c.id)
    selectedCollectionIds.value = ids
    initialCollectionIds.value = [...ids]
  } catch (err: any) {
    if (isCurrent(id, generation)) collectionsError.value = `合集加载失败：${err?.message ?? '请重试'}`
  } finally {
    if (isCurrent(id, generation)) collectionsLoading.value = false
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

function onVisibilityChange(value: 'private' | 'public') {
  form.value.visibility = value
  saveField({ visibility: value })
}

function onTypeChange(v: string) {
  form.value.type = v
  if (!fieldNeedsSave('type')) return
  saveField({ type: v })
}

function onShotAtChange(ms: number | null) {
  form.value.shotAt = ms == null ? null : new Date(ms).toISOString()
  saveField({ shotAt: form.value.shotAt })
}

/**
 * 字段级 patch：只发送当前字段，UI 立即标记已保存。
 * 失败时保留 form 当前值（不回滚），但 saveStatus 切到 error 让用户可见——
 * 用户可以下一次输入再触发一次 saveField；与 video drawer 行为对齐。
 */
function refreshSaveStatus(id: number) {
  if (disposed || !props.show || props.image?.id !== id) return
  const state = fieldSaveStates.get(id)
  if (!state) return
  saveStatus.value = state.pending ? 'saving' : state.errors.size ? 'error' : 'saved'
  saveError.value = [...state.errors.values()][0] ?? ''
  savedAt.value = state.savedAt
}
async function saveField(patch: Partial<LocalForm>, id = props.image?.id) {
  if (id == null) return
  const snapshot = { ...patch }
  const state = fieldSaveStates.get(id) ?? { pending: 0, errors: new Map<string, string>(), savedAt: null, queued: {} }
  fieldSaveStates.set(id, state)
  state.queued = { ...state.queued, ...snapshot }
  state.pending++
  refreshSaveStatus(id)
  saveQueue = saveQueue.then(async () => {
    try {
      await updateImage(id, snapshot)
      emit('patched', id, snapshot)
      for (const field of Object.keys(snapshot)) state.errors.delete(field)
      state.savedAt = new Date()
      if (disposed || props.image?.id !== id || !props.show) return
      initialForm.value = { ...initialForm.value, ...snapshot }
    } catch (err: any) {
      for (const field of Object.keys(snapshot)) state.errors.set(field, err?.message ?? '未知错误')
      if (!disposed && (props.image?.id !== id || !props.show)) {
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

/**
 * 合集变更：与原 ImageManager.handleSave 的 diff 逻辑同形态——
 * 计算 added / removed 后分两次接口调用；任一失败都给 message.error，但保留另一边已成功的部分。
 */
async function onCollectionsChange(ids: number[]) {
  if (!props.image || collectionsLoading.value || collectionsSaving.value || collectionsError.value) return
  const id = props.image.id
  const generation = drawerGeneration
  const before = new Set(initialCollectionIds.value)
  const after = new Set(ids)
  const toAdd = ids.filter((i) => !before.has(i))
  const toRemove = initialCollectionIds.value.filter((i) => !after.has(i))

  selectedCollectionIds.value = [...ids]
  collectionSaveIds.value.add(id)
  try {
    if (toAdd.length > 0) {
      await addImagesToCollections({ imageIds: [id], collectionIds: toAdd })
    }
    if (toRemove.length > 0) {
      await removeImagesFromCollections({ imageIds: [id], collectionIds: toRemove })
    }
    if (isCurrent(id, generation)) initialCollectionIds.value = [...ids]
    emit('collections-changed', id, ids)
  } catch (err: any) {
    if (!disposed) message.error(`合集更新失败：${err?.message ?? '未知错误'}`)
    // 失败时刷新一下选中（让 UI 与后端真实状态尽量同步）
    try {
      const res = await fetchCollectionsWithImageId(id)
      const fresh = (res.data ?? []).map((c) => c.id)
      emit('collections-changed', id, fresh)
      if (isCurrent(id, generation)) {
        selectedCollectionIds.value = fresh
        initialCollectionIds.value = [...fresh]
      }
    } catch (_) {
      if (isCurrent(id, generation)) collectionsError.value = '未能确认合集的最新状态，请重新加载后再编辑。'
    }
  } finally {
    collectionSaveIds.value.delete(id)
    if (!disposed && props.show && props.image?.id === id && generation !== drawerGeneration) void loadCollections()
  }
}

// ---------- 位置 ----------
async function ensureLocationLoaded() {
  if (!props.image || locationLoading.value || locationSaving.value) return
  const { id, uuid } = props.image
  const generation = drawerGeneration
  locationLoading.value = true
  locationError.value = ''
  try {
    const loc = await fetchImageLocation(uuid)
    if (!isCurrent(id, generation)) return
    locationModel.value = loc ? { lat: loc.latitude, lng: loc.longitude } : null
    locationLoaded.value = true
  } catch (err: any) {
    if (isCurrent(id, generation)) locationError.value = `加载位置失败：${err?.message ?? '请重试'}`
  } finally {
    if (isCurrent(id, generation)) locationLoading.value = false
  }
}
async function onLocationSave() {
  if (!props.image || !locationLoaded.value || locationLoading.value || locationSaving.value) return
  if (!locationModel.value) {
    message.warning('请先在地图上选择位置')
    return
  }
  const { id, uuid } = props.image
  const generation = drawerGeneration
  const payload = { longitude: locationModel.value.lng, latitude: locationModel.value.lat }
  locationSaveIds.value.add(id)
  try {
    await updateImageLocation(uuid, payload)
    if (isCurrent(id, generation)) message.success('位置已保存')
  } catch (err: any) {
    if (!disposed) message.error(`位置保存失败：${err?.message ?? '未知错误'}`)
  } finally {
    locationSaveIds.value.delete(id)
  }
}

// ---------- EXIF ----------
async function ensureExifLoaded() {
  if (!props.image || exifLoading.value || exifSaving.value) return
  const { id, uuid } = props.image
  const generation = drawerGeneration
  exifLoading.value = true
  exifError.value = ''
  try {
    const data = await fetchImageExif(uuid)
    if (!isCurrent(id, generation)) return
    exifData.value = data ?? {}
    exifLoaded.value = true
  } catch (err: any) {
    if (isCurrent(id, generation)) exifError.value = `加载 EXIF 失败：${err?.message ?? '请重试'}`
  } finally {
    if (isCurrent(id, generation)) exifLoading.value = false
  }
}
async function onExifSave() {
  if (!props.image || !exifLoaded.value || exifLoading.value || exifSaving.value) return
  const { id, uuid } = props.image
  const generation = drawerGeneration
  const payload = { ...exifData.value }
  exifSaveIds.value.add(id)
  try {
    await updateImageExif(uuid, payload)
    if (isCurrent(id, generation)) message.success('EXIF 已保存')
  } catch (err: any) {
    if (!disposed) message.error(`EXIF 保存失败：${err?.message ?? '未知错误'}`)
  } finally {
    exifSaveIds.value.delete(id)
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
/* 封面区永远是深底；占位文字白字 OK */
.drawer-cover {
  width: 100%;
  /* 图片抽屉里展示图本体，按 contain 让用户能看完整图，不裁切 */
  aspect-ratio: 4 / 3;
  border-radius: 8px;
  overflow: hidden;
  background: #0e0e12;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
}
.drawer-cover img {
  max-width: 100%;
  max-height: 100%;
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
