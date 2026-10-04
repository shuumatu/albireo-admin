<template>
  <!--
    根 div 把 naive-ui 公共 token 注入成 --n-* CSS 变量，
    复用视频侧的 useVideoThemeVars——drawer / 浮动栏走 Teleport 时仍能拿到颜色变量。
  -->
  <div class="image-list-page" :style="themeCssVars">
    <!-- 粘性顶栏：标题 / 搜索 / 类型 / 状态 / 合集 / 排序 / 视图 / 设置 -->
    <ImageFilterBar
      :state="filterBarState"
      :collections="allCollections"
      :active-chips="query.activeChips.value"
      @update-keyword="(v) => query.setFilter({ keyword: v })"
      @update-type="(v) => query.setFilter({ type: v })"
      @update-status="(v) => query.setFilter({ status: v })"
      @update-has-location="(v) => query.setFilter({ hasLocation: v })"
      @update-collection="(v) => query.setFilter({ collectionId: v })"
      @update-order="(orderBy, order) => query.setFilter({ orderBy, order })"
      @change-view="(mode) => query.setFilter({ viewMode: mode }, false)"
      @change-density="(d) => query.setFilter({ density: d }, false)"
      @clear-chip="(key) => query.clearChip(key as any)"
      @clear-all-filters="() => query.clearAllFilters()"
    />

    <!-- "需处理"提醒条：扫一眼最强信号 -->
    <n-alert
      v-if="failedCount > 0 && !dismissedFailedAlert"
      type="error"
      :show-icon="true"
      closable
      class="needs-attention-alert"
      @close="dismissedFailedAlert = true"
    >
      <template #header>
        有 {{ failedCount }} 张图片处理失败，建议检查后重试。
      </template>
      <n-button size="small" type="error" tertiary @click="filterFailedOnly">
        查看失败图片
      </n-button>
    </n-alert>

    <!-- 主内容 -->
    <div class="page-body" :class="`density-${state.density}`">
      <div class="media-toolbar">
        <n-checkbox :checked="allCurrentSelected" :indeterminate="someCurrentSelected && !allCurrentSelected" :disabled="loading || imageList.length === 0" @update:checked="onToggleAllPage">全选本页</n-checkbox>
        <span class="media-toolbar__count" aria-live="polite">共 {{ total }} 张图片<template v-if="selection.hasSelection.value"> · 已选 {{ selection.selectedCount.value }} 项</template></span>
        <div class="media-toolbar__actions">
          <n-button :loading="loading" @click="loadImageList">刷新</n-button>
          <n-button type="primary" @click="goUpload">上传图片</n-button>
        </div>
      </div>
      <n-spin :show="loading" description="正在加载图片…">
        <!-- 网格视图 -->
        <div v-if="state.viewMode === 'grid'">
          <drag-select
            v-model="dragSelectedIds"
            multiple
            :clickOptionToSelect="false"
            :toggleKey="['ctrlKey', 'metaKey']"
            :rangeKey="['shiftKey']"
            background="rgba(47, 123, 91, 0.12)"
            @change="onDragSelectChange"
          >
            <div class="grid-wrap">
              <drag-select-option
                v-for="img in imageList"
                :key="img.id"
                :value="img.id"
                class="grid-cell"
              >
                <ImageCard
                  :image="img"
                  :selected="selection.isSelected(img.id)"
                  :has-selection="selection.hasSelection.value"
                  @click="onImageClick"
                  @dblclick="onImageDblClick"
                  @check="onCheckClick"
                  @menu="onCardMenu"
                  @retry="onRetry"
                />
              </drag-select-option>
            </div>
          </drag-select>
        </div>

        <!-- 列表视图 -->
        <div v-else class="list-wrap">
          <div class="list-header">
            <n-checkbox
              :checked="allCurrentSelected"
              :indeterminate="someCurrentSelected && !allCurrentSelected"
              @update:checked="onToggleAllPage"
            />
            <span class="list-header__hint">
              {{ selection.hasSelection.value
                ? `已选 ${selection.selectedCount.value} 项`
                : '点击选中后可批量操作' }}
            </span>
          </div>
          <ImageListRow
            v-for="img in imageList"
            :key="img.id"
            :image="img"
            :selected="selection.isSelected(img.id)"
            :has-selection="selection.hasSelection.value"
            @click="onImageClick"
            @dblclick="onImageDblClick"
            @check="(v, checked) => onListRowCheck(v, checked)"
            @menu="onCardMenu"
            @retry="onRetry"
          />
        </div>

        <!-- 空状态 -->
        <div v-if="!loading && !loadError && imageList.length === 0" class="empty-wrap">
          <n-empty
            :description="hasAnyFilter ? '没有匹配的图片' : '还没有上传过图片'"
          >
            <template #extra>
              <n-button v-if="hasAnyFilter" @click="query.clearAllFilters()">
                清除全部筛选
              </n-button>
              <n-button v-else type="primary" @click="goUpload">去上传</n-button>
            </template>
          </n-empty>
        </div>

        <!-- 错误状态 -->
        <n-alert
          v-if="loadError"
          type="error"
          show-icon
          style="margin-top: 16px;"
        >
          <template #header>加载图片列表失败</template>
          <n-flex align="center" :wrap="false">
            <span style="flex: 1 1 auto;">{{ loadError }}</span>
            <n-button size="small" @click="loadImageList">重试</n-button>
          </n-flex>
        </n-alert>
      </n-spin>

      <!-- 分页 -->
      <div v-if="total > 0" class="pagination-wrap admin-pagination">
        <n-pagination
          v-model:page="paginationPage"
          :page-size="state.pageSize"
          :item-count="total"
          :page-slot="5"
          :disabled="loading"
          show-size-picker
          :page-sizes="[20, 40, 60, 100]"
          @update:page-size="(s: number) => query.setFilter({ pageSize: s })"
        />
      </div>
    </div>

    <!-- 浮动操作栏 -->
    <ImageFloatingActionBar
      :selected-count="selection.selectedCount.value"
      :cross-page-count="selection.crossPageSelectedCount.value"
      :busy="batchBusy"
      :collections="allCollections"
      :is-in-collection-view="isInCollectionView"
      @add-to-collections="onBatchAddToCollections"
      @change-type="onBatchChangeType"
      @delete="onBatchDeleteOrRemove"
      @clear="selection.clearAll"
    />

    <!-- 编辑抽屉 -->
    <ImageEditDrawer
      v-model:show="drawerShow"
      :image="drawerImage"
      :collections="allCollections"
      :has-prev="drawerHasPrev"
      :has-next="drawerHasNext"
      @navigate="onDrawerNavigate"
      @delete="onDrawerDelete"
      @share="(img: ImageItem) => openShareDialog(img)"
      @patched="onDrawerPatched"
      @collections-changed="onDrawerCollectionsChanged"
    />

    <!-- 分享对话框（卡片菜单 / 列表菜单 / 抽屉头部任一入口触发都汇聚到这里） -->
    <ShareDialog
      v-model:show="shareDialogShow"
      :target="shareTarget"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  NSpin,
  NEmpty,
  NPagination,
  NAlert,
  NButton,
  NFlex,
  NCheckbox,
  useMessage,
  useDialog,
} from 'naive-ui'
import { useVideoThemeVars } from '../video/composables/useVideoThemeVars'
import ImageFilterBar from './ImageFilterBar.vue'
import ImageCard from './ImageCard.vue'
import ImageListRow from './ImageListRow.vue'
import ImageFloatingActionBar from './ImageFloatingActionBar.vue'
import ImageEditDrawer from './ImageEditDrawer.vue'
import ShareDialog from '../../components/share/ShareDialog.vue'
import { useImageQuery } from './composables/useImageQuery'
import { useImageSelection } from './composables/useImageSelection'
// 公共站 origin 算法与视频侧共用，跨页面体验一致；图片详情路径是 /image/{uuid}
import { getPublicSiteOrigin } from '../video/composables/videoFormat'
import {
  fetchImages,
  fetchImagesWithCollectionId,
  deleteImage,
  addImagesToCollections,
  removeImagesFromCollections,
  updateImage,
} from '../../api/images'
import type { ImageItem, ImageParams } from '../../api/images'
import { fetchImageCollectionsIds } from '../../api/manager'
import { useImageManagerStore } from '../../stores/imageManager'
import { useCollectionDetailStore, useCollectionStore } from '../../stores/collection'
import { imageNeedsAttention } from './composables/imageFormat'

const message = useMessage()
const dialog = useDialog()
const router = useRouter()
const route = useRoute()
const collectionStore = useCollectionStore()
const imageManagerStore = useImageManagerStore()
const collectionDetailStore = useCollectionDetailStore()

const themeCssVars = useVideoThemeVars()

const query = useImageQuery()
const state = computed(() => query.state.value)
const selection = useImageSelection()

/**
 * 嵌入在 CollectionDetail 内时——不走 URL 上的 collectionId，而是用 store 里上一步选中的 id。
 * /manager/image 直链场景下 collectionDetailStore.img 已经被 onMounted 重置成 null。
 */
const isInCollectionView = computed(() => !!collectionDetailStore.img)

// ---------- 数据 ----------
const imageList = ref<ImageItem[]>([])
const total = ref(0)
const loading = ref(false)
const loadError = ref('')
const batchBusy = ref(false)
let listRequest = 0
const allCollections = ref<{ id: number; name: string }[]>([])

// ---------- 派生状态 ----------
const failedCount = computed(() => imageList.value.filter((v) => imageNeedsAttention(v.status)).length)
const dismissedFailedAlert = ref(false)
function filterFailedOnly() {
  query.setFilter({ status: imageList.value.find((v) => imageNeedsAttention(v.status))?.status ?? 'failed' })
  dismissedFailedAlert.value = false
}

/**
 * "有筛选"判断：
 *  - keyword / status / hasLocation / collectionId 任一非空算筛选；
 *  - type 因为默认值是 'photo'（不是 null），仅当 type 不是默认值时才算筛选
 *    （否则刚进页面就提示"清除筛选"反而困惑）。
 */
const hasAnyFilter = computed(
  () => !!state.value.keyword
    || state.value.type !== 'photo'
    || !!state.value.status
    || !!state.value.hasLocation
    || state.value.collectionId != null
)

const filterBarState = computed(() => ({
  keyword: state.value.keyword,
  type: state.value.type,
  status: state.value.status,
  hasLocation: state.value.hasLocation,
  orderBy: state.value.orderBy,
  order: state.value.order,
  viewMode: state.value.viewMode,
  density: state.value.density,
  collectionId: state.value.collectionId,
}))

const paginationPage = computed({
  get: () => state.value.page,
  set: (p: number) => query.setFilter({ page: p }, false),
})

// 选中：当前页全选状态
const allCurrentSelected = computed(
  () => imageList.value.length > 0 && imageList.value.every((v) => selection.isSelected(v.id))
)
const someCurrentSelected = computed(() => imageList.value.some((v) => selection.isSelected(v.id)))

// drag-select 适配
const dragSelectedIds = ref<number[]>([])
function onDragSelectChange(_: number[]) {
  // change 事件先于 v-model 更新，留给 watch 处理
}
watch(dragSelectedIds, (ids) => {
  if (!ids || ids.length === 0) return
  const next = new Set(selection.selectedKeys.value)
  for (const id of ids) next.add(id)
  selection.setSelected(next)
  dragSelectedIds.value = []
})

// ---------- 数据加载 ----------
async function loadImageList() {
  const requestId = ++listRequest
  loading.value = true
  loadError.value = ''
  try {
    const params: ImageParams = {
      page: state.value.page,
      pageSize: state.value.pageSize,
      keyword: state.value.keyword || undefined,
      // type === null 表示"全部类型"，此时不传 type 即可让后端走全量分支
      type: state.value.type ?? undefined,
      status: state.value.status || undefined,
      hasLocation: state.value.hasLocation ?? undefined,
      orderBy: state.value.orderBy,
      order: state.value.order,
    }

    let resp: { total: number; data: ImageItem[] }
    if (isInCollectionView.value && imageManagerStore.collectionId != null) {
      resp = (await fetchImagesWithCollectionId(imageManagerStore.collectionId, params)) as unknown as { total: number; data: ImageItem[] }
    } else if (state.value.collectionId != null) {
      resp = (await fetchImagesWithCollectionId(state.value.collectionId, params)) as unknown as { total: number; data: ImageItem[] }
    } else {
      resp = (await fetchImages(params)) as unknown as { total: number; data: ImageItem[] }
    }

    if (requestId !== listRequest) return
    const lastPage = Math.max(1, Math.ceil((resp.total ?? 0) / state.value.pageSize))
    if (state.value.page > lastPage) {
      query.setFilter({ page: lastPage }, false)
      return
    }
    imageList.value = resp.data ?? []
    total.value = resp.total ?? 0
    selection.setCurrentPage(imageList.value)
    collectionStore.setCollection(state.value.collectionId)
  } catch (err: any) {
    if (requestId !== listRequest) return
    loadError.value = err?.message ?? '未知错误'
    imageList.value = []
    selection.setCurrentPage([])
    total.value = 0
  } finally {
    if (requestId === listRequest) loading.value = false
  }
}

async function loadCollections() {
  try {
    const list = await fetchImageCollectionsIds()
    allCollections.value = (list as any[]).map((c) => ({ id: Number(c.id), name: c.name }))
  } catch (_) { /* 合集失败不阻塞主列表 */ }
}

// 监听筛选 / 分页 / 排序变化，自动重拉
watch(
  () => [
    state.value.page,
    state.value.pageSize,
    state.value.collectionId,
    state.value.keyword,
    state.value.type,
    state.value.status,
    state.value.hasLocation,
    state.value.orderBy,
    state.value.order,
  ],
  () => loadImageList(),
  { flush: 'post' }
)

// ---------- 卡片点击 / 选中 ----------
/**
 * 单击 / 双击区分（与 VideoListPage 同形态）：
 *  - ctrl/meta/shift 立即处理（多选 / 范围选不能延迟）；
 *  - 普通单击 → 250 ms 后才打开抽屉；这段时间内来一个 dblclick 就取消，
 *    改为打开公共站 /image/{uuid}。
 *
 * 250 ms 是常见的 UX 折中：能稳定识别双击，又不会让单击响应肉眼可感。
 */
let pendingClickTimer: number | null = null
function clearPendingClick() {
  if (pendingClickTimer != null) {
    window.clearTimeout(pendingClickTimer)
    pendingClickTimer = null
  }
}
function onImageClick(image: ImageItem, ev: MouseEvent) {
  if (selection.hasSelection.value || ev.ctrlKey || ev.metaKey || ev.shiftKey) {
    selection.handleClick(image.id, {
      ctrlKey: ev.ctrlKey,
      metaKey: ev.metaKey,
      shiftKey: ev.shiftKey,
    })
    return
  }
  clearPendingClick()
  pendingClickTimer = window.setTimeout(() => {
    pendingClickTimer = null
    openDrawer(image)
  }, 250)
}
function onImageDblClick(image: ImageItem) {
  clearPendingClick()
  openPublic(image)
}

function openPublic(image: ImageItem) {
  const origin = getPublicSiteOrigin()
  window.open(`${origin}/image/${image.uuid}`, '_blank', 'noopener,noreferrer')
}
function onCheckClick(image: ImageItem, _ev: MouseEvent) {
  selection.toggle(image.id)
}
function onListRowCheck(image: ImageItem, checked: boolean) {
  if (checked && !selection.isSelected(image.id)) selection.toggle(image.id)
  else if (!checked && selection.isSelected(image.id)) selection.toggle(image.id)
}
function onToggleAllPage(checked: boolean) {
  if (checked) selection.selectAllCurrentPage()
  else {
    const inPage = imageList.value.map((v) => v.id)
    selection.removeFromSelection(inPage)
  }
}

// ---------- 卡片菜单 ----------
function onCardMenu(image: ImageItem, action: string) {
  switch (action) {
    case 'edit': openDrawer(image); break
    case 'open-public': openPublic(image); break
    case 'location':
      // 位置编辑统一进抽屉的 Tab，避免再开一个 modal
      openDrawer(image)
      break
    case 'exif':
      openDrawer(image)
      break
    case 'comment':
      router.push({ path: '/manager/comment', query: { targetType: 'image', targetId: image.uuid } })
      break
    case 'retry':
      onRetry(image)
      break
    case 'share':
      openShareDialog(image)
      break
    case 'delete':
      confirmDeleteOne(image)
      break
  }
}

// ---------- 分享 ----------
const shareDialogShow = ref(false)
const shareTarget = ref<{ targetType: 'image'; targetId: number; name: string; coverUrl: string | null } | null>(null)

function openShareDialog(image: ImageItem) {
  shareTarget.value = {
    targetType: 'image',
    targetId: image.id,
    name: image.title || image.fileName || `图片 #${image.id}`,
    coverUrl: image.mediumUrl || image.thumbnailUrl || image.imageUrl || null,
  }
  shareDialogShow.value = true
}

async function confirmDeleteOne(image: ImageItem) {
  if (isInCollectionView.value && imageManagerStore.collectionId != null) {
    // 合集详情场景：单张操作改为"从合集移除"
    dialog.warning({
      title: '从合集移除',
      content: `确定从当前合集中移除「${image.title || image.fileName}」？图片本身不会被删除。`,
      positiveText: '确定',
      negativeText: '取消',
      onPositiveClick: async () => {
        try {
          await removeImagesFromCollections({ imageIds: [image.id], collectionIds: [imageManagerStore.collectionId!] })
          message.success('已从合集移除')
          selection.removeFromSelection([image.id])
          if (drawerImage.value?.id === image.id) drawerShow.value = false
          await loadImageList()
        } catch (err: any) {
          message.error(`移除失败：${err?.message ?? '未知错误'}`)
        }
      },
    })
    return
  }
  dialog.warning({
    title: '确认删除',
    content: `确定删除「${image.title || image.fileName}」？此操作不可恢复。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await deleteImage([image.id])
        message.success('已删除')
        selection.removeFromSelection([image.id])
        if (drawerImage.value?.id === image.id) drawerShow.value = false
        await loadImageList()
      } catch (err: any) {
        message.error(`删除失败：${err?.message ?? '未知错误'}`)
      }
    },
  })
}

async function onRetry(_image: ImageItem) {
  message.info(_image.status === 'process_failed' ? '请在重新处理页面提交图片处理任务' : '请重新选择原文件继续上传')
  router.push(_image.status === 'process_failed' ? '/manager/reprocess' : '/upload')
}

// ---------- 抽屉编辑 ----------
const drawerShow = ref(false)
const drawerImage = ref<ImageItem | null>(null)
const drawerIndex = computed(() =>
  drawerImage.value ? imageList.value.findIndex((v) => v.id === drawerImage.value!.id) : -1
)
const drawerHasPrev = computed(() => drawerIndex.value > 0)
const drawerHasNext = computed(() => drawerIndex.value >= 0 && drawerIndex.value < imageList.value.length - 1)

function openDrawer(image: ImageItem) {
  drawerImage.value = image
  drawerShow.value = true
}
function onDrawerNavigate(delta: -1 | 1) {
  const idx = drawerIndex.value
  const next = idx + delta
  if (next < 0 || next >= imageList.value.length) return
  drawerImage.value = imageList.value[next]
}
function onDrawerDelete() {
  if (drawerImage.value) confirmDeleteOne(drawerImage.value)
}
function onDrawerPatched(imageId: number, patch: Partial<ImageItem>) {
  // 列表本地 patch，避免每次自动保存都全量刷新
  const idx = imageList.value.findIndex((v) => v.id === imageId)
  if (idx >= 0) {
    imageList.value[idx] = { ...imageList.value[idx], ...patch }
    if (drawerImage.value?.id === imageId) {
      drawerImage.value = { ...drawerImage.value, ...patch } as ImageItem
    }
  }
}
async function onDrawerCollectionsChanged(imageId: number, collectionIds: number[]) {
  if (!drawerImage.value || drawerImage.value.id !== imageId) return
  // 抽屉内已经调过 add/remove 接口，这里只做本地 patch + 同步父组件状态
  const newCollections = collectionIds.map((id) => {
    const c = allCollections.value.find((x) => x.id === id)
    return { id, name: c?.name ?? `#${id}`, description: '' }
  })
  onDrawerPatched(imageId, { collections: newCollections })
}

// ---------- 批量操作 ----------
async function onBatchAddToCollections(collectionIds: number[]) {
  if (collectionIds.length === 0) return
  const ids = selection.selectedArray.value
  if (ids.length === 0 || batchBusy.value) return
  batchBusy.value = true
  try {
    await addImagesToCollections({ imageIds: ids, collectionIds })
    message.success(`已加入 ${collectionIds.length} 个合集`)
    await loadImageList()
  } catch (err: any) {
    message.error(`加合集失败：${err?.message ?? '未知错误'}`)
  } finally {
    batchBusy.value = false
  }
}

/**
 * 批量改类型：图片有 photo / cover / other 三类。一次循环对每张图调 updateImage——
 * 后端没有专门的"批量更新"接口，但 updateImage 是字段级 patch，每次只发 type，开销可控。
 */
async function onBatchChangeType(type: string) {
  const ids = selection.selectedArray.value
  if (ids.length === 0 || batchBusy.value) return
  batchBusy.value = true
  try {
    const results = await Promise.allSettled(ids.map((id) => updateImage(id, { type })))
    const failed = results.filter((r) => r.status === 'rejected').length
    if (failed) message.warning(`已更新 ${ids.length - failed} 项，${failed} 项失败，可重新尝试`)
    else message.success(`已更新 ${ids.length} 张图片的类型`)
    await loadImageList()
  } catch (err: any) {
    message.error(`批量改类型失败：${err?.message ?? '未知错误'}`)
  } finally {
    batchBusy.value = false
  }
}

async function onBatchDeleteOrRemove() {
  const ids = selection.selectedArray.value
  if (ids.length === 0 || batchBusy.value) return
  batchBusy.value = true
  try {
    if (isInCollectionView.value && imageManagerStore.collectionId != null) {
      await removeImagesFromCollections({ imageIds: ids, collectionIds: [imageManagerStore.collectionId] })
      message.success(`已从合集中移除 ${ids.length} 张图片`)
    } else {
      await deleteImage(ids)
      message.success(`已删除 ${ids.length} 张图片`)
    }
    selection.clearAll()
    await loadImageList()
  } catch (err: any) {
    message.error(`操作失败：${err?.message ?? '未知错误'}`)
  } finally {
    batchBusy.value = false
  }
}

function confirmKeyboardDelete() {
  if (batchBusy.value) return
  dialog.warning({
    title: '确认批量操作',
    content: isInCollectionView.value ? `确定从合集中移除已选 ${selection.selectedCount.value} 项？原始图片会保留。` : `确定删除已选 ${selection.selectedCount.value} 项？此操作不可恢复。`,
    positiveText: '确认', negativeText: '取消',
    onPositiveClick: () => onBatchDeleteOrRemove(),
  })
}

function goUpload() {
  router.push('/upload')
}

// ---------- 键盘快捷键 ----------
function onGlobalKey(ev: KeyboardEvent) {
  const tag = (ev.target as HTMLElement)?.tagName
  const inEditable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (ev.target as HTMLElement)?.isContentEditable

  if (ev.key === '/' && !inEditable) {
    ev.preventDefault()
    const input = document.querySelector<HTMLInputElement>('.search-input input')
    input?.focus()
    return
  }
  if (ev.key === 'Escape') {
    if (drawerShow.value) {
      drawerShow.value = false
    } else if (selection.hasSelection.value) {
      selection.clearAll()
    }
    return
  }
  if (inEditable || ev.isComposing || ev.ctrlKey || ev.metaKey || ev.altKey || document.querySelector('.n-dialog, .n-modal, [role="listbox"]')) return

  if (ev.key === 'a' && !ev.ctrlKey && !ev.metaKey) {
    ev.preventDefault()
    selection.selectAllCurrentPage()
    return
  }
  if (ev.key === 'v') {
    query.setFilter({ viewMode: state.value.viewMode === 'grid' ? 'list' : 'grid' }, false)
    return
  }
  if (ev.key === 'g') {
    query.setFilter({ viewMode: 'grid' }, false)
    return
  }
  if (ev.key === 'l') {
    query.setFilter({ viewMode: 'list' }, false)
    return
  }
  if (ev.key === 'Delete' && selection.hasSelection.value) {
    confirmKeyboardDelete()
    return
  }
  // 抽屉打开时按 ↑/↓ 切换
  if (drawerShow.value) {
    if (ev.key === 'ArrowUp') {
      ev.preventDefault()
      onDrawerNavigate(-1)
    } else if (ev.key === 'ArrowDown') {
      ev.preventDefault()
      onDrawerNavigate(1)
    }
  }
}

onMounted(() => {
  // 与旧 ImageManager 行为对齐：直访 /manager/image 时强制清掉合集模式标记，
  // 避免上次从 CollectionDetail 跳过来留下的污染状态。
  if (route.path === '/manager/image' && collectionDetailStore.img) {
    collectionDetailStore.img = null
  }
  /*
    嵌入在 CollectionDetail 内时，默认 type='photo' 会把合集里的 cover/other
    类型图片全部过滤掉，呈现"刚加进来的图却看不到"的困惑。
    所以这里把 type 重置为 null（"全部类型"），让合集内容完整可见；
    用户依然可以在筛选条里手动改回 photo。
    注意：setFilter 会触发 state 的 watcher 自动 loadImageList，
    因此分支内不再重复调用 loadImageList()，避免双发请求。
  */
  loadCollections()
  if (isInCollectionView.value && state.value.type === 'photo') {
    query.setFilter({ type: null }, false)
  } else {
    loadImageList()
  }
  window.addEventListener('keydown', onGlobalKey)
})
onBeforeUnmount(() => {
  listRequest++
  // 卸载时清掉等待中的"延迟单击"，避免组件销毁后 timer 触发 openDrawer / 抛错
  clearPendingClick()
  window.removeEventListener('keydown', onGlobalKey)
})
</script>

<style scoped>
.image-list-page {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  /*
    页面底色：固定一档冷灰（#f5f6f8），让 #fff 卡片明显浮出来。
    与视频侧 .video-list-page 保持视觉一致；项目当前固定浅主题，深主题切换再统一改回 var(--n-body-color)。
  */
  background: var(--admin-bg, #f5f9f5);
  color: var(--n-text-color-2);
}

.needs-attention-alert {
  margin: 12px 20px 0 20px;
  border-radius: 8px;
}

.page-body {
  flex: 1 1 auto;
  padding: 16px 20px 96px 20px;
  overflow: hidden;
}

/*
  网格密度：图片 1:1 比视频 16:9 紧凑，适当缩小最小宽度让一行容纳更多缩略图。
  紧凑 / 舒适 / 宽松三档分别对应不同 minmax。
*/
.grid-wrap {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
}
.density-compact .grid-wrap {
  gap: 8px;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
}
.density-spacious .grid-wrap {
  gap: 22px;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
}
.grid-cell {
  /* drag-select-option 默认 inline，强制 block 让 grid 正常排版 */
  display: block;
}

.list-wrap {
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: var(--n-card-color);
  border-radius: 14px;
  padding: 6px 8px;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.06);
}
.list-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--n-text-color-3);
  border-bottom: 1px solid var(--n-divider-color);
  margin-bottom: 4px;
}

.empty-wrap {
  padding: 60px 20px;
}

.pagination-wrap {
  margin-top: 18px;
  display: flex;
  justify-content: center;
}

.media-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 18px; padding: 12px 16px; background: var(--n-card-color, #fff); border: 1px solid var(--n-border-color, #e0e9e1); border-radius: 14px; }
.media-toolbar__count { color: var(--n-text-color-3); font-size: 13px; }
.media-toolbar__actions { display: flex; gap: 8px; margin-left: auto; }
.grid-wrap, .list-wrap { animation: media-appear .24s ease both; }
@keyframes media-appear { from { opacity: .5; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
@media (max-width: 640px) {
  .page-body { padding: 12px 12px 150px; }
  .needs-attention-alert { margin: 12px; }
  .grid-wrap, .density-compact .grid-wrap, .density-spacious .grid-wrap { grid-template-columns: repeat(auto-fill, minmax(min(100%, 150px), 1fr)); gap: 10px; }
  .media-toolbar { gap: 10px; padding: 12px; }
  .media-toolbar__actions { width: 100%; justify-content: flex-end; }
  .pagination-wrap { overflow-x: auto; justify-content: flex-start; }
}
@media (prefers-reduced-motion: reduce) { .grid-wrap, .list-wrap { animation: none; } }
</style>
