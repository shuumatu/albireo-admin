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

        <!-- 标题：默认像普通文字，hover 出下划线，聚焦后变 input。失焦自动保存 -->
        <div class="title-edit">
          <input
            class="title-edit__input"
            type="text"
            :value="form.title ?? ''"
            :placeholder="image.fileName || '未命名图片'"
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
              :options="collectionOptions"
              placeholder="选择合集"
              @update:value="onCollectionsChange"
            />
          </div>
        </div>

        <!-- 位置 / EXIF 用 tabs 折叠避免抽屉太长 -->
        <n-tabs type="line" size="small" :default-value="'location'">
          <n-tab-pane name="location" tab="位置">
            <p v-if="!locationLoaded" class="hint">点击下方按钮加载该图片的 GPS 位置（无位置时可在地图上自行选点）。</p>
            <n-button
              v-if="!locationLoaded"
              size="small"
              :loading="locationLoading"
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
                <n-button size="small" :loading="locationSaving" @click="onLocationSave">保存位置</n-button>
              </n-flex>
            </template>
          </n-tab-pane>
          <n-tab-pane name="exif" tab="EXIF">
            <p v-if="!exifLoaded" class="hint">点击下方按钮加载摄影元数据；尚无数据时可直接填写后保存。</p>
            <n-button
              v-if="!exifLoaded"
              size="small"
              :loading="exifLoading"
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
import ExifEditor from '../../components/ExifEditor.vue'
import type { ImageItem } from '../../api/images'
import { updateImage, addImagesToCollections, removeImagesFromCollections, fetchCollectionsWithImageId } from '../../api/images'
import { fetchImageLocation, updateImageLocation } from '../../api/location'
import { fetchImageExif, updateImageExif, type ExifData } from '../../api/exif'
import { useVideoThemeVars } from '../video/composables/useVideoThemeVars'
import { toMediumUrl } from './composables/imageFormat'

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
  /** 字段级保存成功后通知父组件 patch 列表中的图片对象 */
  (e: 'patched', imageId: number, patch: Partial<ImageItem>): void
  (e: 'collections-changed', imageId: number, collectionIds: number[]): void
}>()

const message = useMessage()

interface LocalForm {
  title: string | null
  description: string | null
  type: string | null
  shotAt: string | null
}
const form = ref<LocalForm>({ title: null, description: null, type: null, shotAt: null })
const initialForm = ref<LocalForm>({ title: null, description: null, type: null, shotAt: null })

const saveStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const saveError = ref('')
const savedAt = ref<Date | null>(null)
const savedAtText = computed(() =>
  savedAt.value ? savedAt.value.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''
)

const coverFailed = ref(false)
const cover = computed(() => toMediumUrl(props.image?.imageUrl))

const createdAtText = computed(() => {
  if (!props.image?.createdAt) return ''
  const d = new Date(props.image.createdAt)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('zh-CN')
})

// ---------- 合集状态 ----------
const selectedCollectionIds = ref<number[]>([])
const initialCollectionIds = ref<number[]>([])
const collectionOptions = computed(() =>
  props.collections.map((c) => ({ label: c.name, value: c.id }))
)

// ---------- 位置（懒加载） ----------
const locationLoaded = ref(false)
const locationLoading = ref(false)
const locationSaving = ref(false)
const locationModel = ref<{ lat: number; lng: number } | null>(null)

// ---------- EXIF（懒加载） ----------
const exifLoaded = ref(false)
const exifLoading = ref(false)
const exifSaving = ref(false)
const exifData = ref<ExifData>({})

const shotAtMs = computed<number | null>(() => {
  if (!form.value.shotAt) return null
  const t = Date.parse(form.value.shotAt)
  return Number.isFinite(t) ? t : null
})

/**
 * 当 image 切换或抽屉打开时，重置表单 + 重新拉关联数据。
 * 用 image.id 触发，避免父对象引用变化导致重复加载。
 * 合集数据改用 fetchCollectionsWithImageId（与 props.image.collections 同源备份）：
 * 后端老数据 props.image.collections 可能为 null，必须主动拉一次保证编辑准确。
 */
watch(
  () => [props.show, props.image?.id] as const,
  async ([show, _id]) => {
    if (!show || !props.image) return
    const v = props.image
    form.value = {
      title: v.title ?? '',
      description: v.description ?? '',
      type: v.type ?? 'photo',
      shotAt: v.shotAt ?? null,
    }
    initialForm.value = { ...form.value }
    saveStatus.value = 'idle'
    coverFailed.value = false

    // 重置懒加载状态——切换图片后位置 / EXIF 都要重新加载
    locationLoaded.value = false
    locationModel.value = null
    exifLoaded.value = false
    exifData.value = {}

    // 合集：优先用 props 上挂的，没有就调接口补一次
    if (v.collections && v.collections.length >= 0) {
      selectedCollectionIds.value = v.collections.map((c) => c.id)
      initialCollectionIds.value = [...selectedCollectionIds.value]
    } else {
      try {
        const res = await fetchCollectionsWithImageId(v.id)
        const ids = (res.data ?? []).map((c) => c.id)
        selectedCollectionIds.value = ids
        initialCollectionIds.value = [...ids]
      } catch (err) {
        console.warn('加载图片合集关联失败', err)
        selectedCollectionIds.value = []
        initialCollectionIds.value = []
      }
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

function onTypeChange(v: string) {
  form.value.type = v
  if (v === initialForm.value.type) return
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
async function saveField(patch: Partial<LocalForm>) {
  if (!props.image) return
  const id = props.image.id
  saveStatus.value = 'saving'
  saveError.value = ''
  try {
    await updateImage(id, {
      title: patch.title ?? undefined,
      description: patch.description ?? undefined,
      type: patch.type ?? undefined,
      shotAt: patch.shotAt ?? undefined,
    })
    initialForm.value = { ...form.value }
    saveStatus.value = 'saved'
    savedAt.value = new Date()
    emit('patched', id, {
      title: form.value.title,
      description: form.value.description,
      type: form.value.type ?? undefined,
      shotAt: form.value.shotAt,
    })
  } catch (err: any) {
    saveStatus.value = 'error'
    saveError.value = err?.message ?? '未知错误'
  }
}

/**
 * 合集变更：与原 ImageManager.handleSave 的 diff 逻辑同形态——
 * 计算 added / removed 后分两次接口调用；任一失败都给 message.error，但保留另一边已成功的部分。
 */
async function onCollectionsChange(ids: number[]) {
  if (!props.image) return
  const id = props.image.id
  const before = new Set(initialCollectionIds.value)
  const after = new Set(ids)
  const toAdd = ids.filter((i) => !before.has(i))
  const toRemove = initialCollectionIds.value.filter((i) => !after.has(i))

  selectedCollectionIds.value = ids
  try {
    if (toAdd.length > 0) {
      await addImagesToCollections({ imageIds: [id], collectionIds: toAdd })
    }
    if (toRemove.length > 0) {
      await removeImagesFromCollections({ imageIds: [id], collectionIds: toRemove })
    }
    initialCollectionIds.value = [...ids]
    emit('collections-changed', id, ids)
  } catch (err: any) {
    message.error(`合集更新失败：${err?.message ?? '未知错误'}`)
    // 失败时刷新一下选中（让 UI 与后端真实状态尽量同步）
    try {
      const res = await fetchCollectionsWithImageId(id)
      const fresh = (res.data ?? []).map((c) => c.id)
      selectedCollectionIds.value = fresh
      initialCollectionIds.value = [...fresh]
    } catch (_) { /* 忽略 */ }
  }
}

// ---------- 位置 ----------
async function ensureLocationLoaded() {
  if (!props.image) return
  locationLoading.value = true
  try {
    const loc = await fetchImageLocation(props.image.uuid)
    locationModel.value = loc ? { lat: loc.latitude, lng: loc.longitude } : null
    locationLoaded.value = true
  } catch (err: any) {
    message.error(`加载位置失败：${err?.message ?? '未知错误'}`)
  } finally {
    locationLoading.value = false
  }
}
async function onLocationSave() {
  if (!props.image) return
  if (!locationModel.value) {
    message.warning('请先在地图上选择位置')
    return
  }
  locationSaving.value = true
  try {
    await updateImageLocation(props.image.uuid, {
      longitude: locationModel.value.lng,
      latitude: locationModel.value.lat,
    })
    message.success('位置已保存')
  } catch (err: any) {
    message.error(`位置保存失败：${err?.message ?? '未知错误'}`)
  } finally {
    locationSaving.value = false
  }
}

// ---------- EXIF ----------
async function ensureExifLoaded() {
  if (!props.image) return
  exifLoading.value = true
  try {
    const data = await fetchImageExif(props.image.uuid)
    exifData.value = data ?? {}
    exifLoaded.value = true
  } catch (err: any) {
    message.error(`加载 EXIF 失败：${err?.message ?? '未知错误'}`)
  } finally {
    exifLoading.value = false
  }
}
async function onExifSave() {
  if (!props.image) return
  exifSaving.value = true
  try {
    await updateImageExif(props.image.uuid, exifData.value)
    message.success('EXIF 已保存')
  } catch (err: any) {
    message.error(`EXIF 保存失败：${err?.message ?? '未知错误'}`)
  } finally {
    exifSaving.value = false
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
