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
      <n-spin :show="loading">
        <!-- 网格视图 -->
        <div v-if="state.viewMode === 'grid'">
          <drag-select
            v-model="dragSelectedIds"
            multiple
            :clickOptionToSelect="false"
            :toggleKey="['ctrlKey', 'metaKey']"
            :rangeKey="['shiftKey']"
            background="rgba(60, 213, 111, 0.1)"
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
        <div v-if="!loading && imageList.length === 0" class="empty-wrap">
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
      <div v-if="total > 0" class="pagination-wrap">
        <n-pagination
          v-model:page="paginationPage"
          :page-size="state.pageSize"
          :item-count="total"
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
      @patched="onDrawerPatched"
      @collections-changed="onDrawerCollectionsChanged"
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
const allCollections = ref<{ id: number; name: string }[]>([])

// ---------- 派生状态 ----------
const failedCount = computed(() => imageList.value.filter((v) => imageNeedsAttention(v.status)).length)
const dismissedFailedAlert = ref(false)
function filterFailedOnly() {
  query.setFilter({ status: 'failed' })
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

    imageList.value = resp.data ?? []
    total.value = resp.total ?? 0
    selection.setCurrentPage(imageList.value)
    collectionStore.setCollection(state.value.collectionId)
  } catch (err: any) {
    loadError.value = err?.message ?? '未知错误'
    imageList.value = []
    total.value = 0
  } finally {
    loading.value = false
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
  if (ev.ctrlKey || ev.metaKey || ev.shiftKey) {
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
  window.open(`${origin}/image/${image.uuid}`, '_blank')
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
    case 'delete':
      confirmDeleteOne(image)
      break
  }
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
  // TODO: 接入图片重试接口（当前后端尚无），刷新列表让用户感知到状态在拉
  message.info('重试已发送（待接入对应后端接口）')
  await loadImageList()
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
  if (ids.length === 0) return
  try {
    await addImagesToCollections({ imageIds: ids, collectionIds })
    message.success(`已加入 ${collectionIds.length} 个合集`)
    await loadImageList()
  } catch (err: any) {
    message.error(`加合集失败：${err?.message ?? '未知错误'}`)
  }
}

/**
 * 批量改类型：图片有 photo / cover / other 三类。一次循环对每张图调 updateImage——
 * 后端没有专门的"批量更新"接口，但 updateImage 是字段级 patch，每次只发 type，开销可控。
 */
async function onBatchChangeType(type: string) {
  const ids = selection.selectedArray.value
  if (ids.length === 0) return
  try {
    await Promise.all(ids.map((id) => updateImage(id, { type }).catch((e) => e)))
    message.success(`已批量改类型为 ${type}`)
    await loadImageList()
  } catch (err: any) {
    message.error(`批量改类型失败：${err?.message ?? '未知错误'}`)
  }
}

async function onBatchDeleteOrRemove() {
  const ids = selection.selectedArray.value
  if (ids.length === 0) return
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
  }
}

function goUpload() {
  router.push('/upload')
}

// ---------- 键盘快捷键 ----------
function onGlobalKey(ev: KeyboardEvent) {
  const tag = (ev.target as HTMLElement)?.tagName
  const inEditable = tag === 'INPUT' || tag === 'TEXTAREA' || (ev.target as HTMLElement)?.isContentEditable

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
  if (inEditable) return

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
    onBatchDeleteOrRemove()
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
  loadCollections()
  loadImageList()
  window.addEventListener('keydown', onGlobalKey)
})
onBeforeUnmount(() => {
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
  background: #f5f6f8;
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
  border-radius: 10px;
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
</style>
