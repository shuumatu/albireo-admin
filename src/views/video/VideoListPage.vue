<template>
  <!--
    根 div 把 naive-ui 公共 token 注入成 --n-* CSS 变量，
    给所有非 naive 子节点（VideoCard 等自写 div）也能用主题色。
    n-layout-content 默认只暴露 --n-color / --n-text-color，其它（如 --n-card-color
    / --n-divider-color / --n-text-color-1/2/3）需要显式注入。
  -->
  <div class="video-list-page" :style="themeCssVars">
    <!-- 粘性顶栏：标题 / 搜索 / 筛选 / 视图切换 / 设置 -->
    <VideoFilterBar
      :state="filterBarState"
      :collections="allCollections"
      :active-chips="query.activeChips.value"
      @update-keyword="(v) => query.setFilter({ keyword: v })"
      @update-status="(v) => query.setFilter({ status: v })"
      @update-visibility="(v) => query.setFilter({ visibility: v })"
      @update-has-location="(v) => query.setFilter({ hasLocation: v })"
      @update-collection="(v) => query.setFilter({ collectionId: v })"
      @update-order="(orderBy, order) => query.setFilter({ orderBy, order })"
      @change-view="(mode) => query.setFilter({ viewMode: mode }, false)"
      @change-density="(d) => query.setFilter({ density: d }, false)"
      @toggle-hover-preview="() => query.setFilter({ hoverPreview: !state.hoverPreview }, false)"
      @clear-chip="(key) => query.clearChip(key as any)"
      @clear-all-filters="() => query.clearAllFilters()"
    />

    <!-- "需处理"提醒条：扫一眼最强信号 -->
    <n-alert
      v-if="failedCount > 0"
      type="error"
      :show-icon="true"
      closable
      class="needs-attention-alert"
      @close="dismissedFailedAlert = true"
      v-show="!dismissedFailedAlert"
    >
      <template #header>
        有 {{ failedCount }} 个视频处理失败，建议检查后重试。
      </template>
      <n-button size="small" type="error" tertiary @click="filterFailedOnly">
        查看失败视频
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
                v-for="video in videoList"
                :key="video.id"
                :value="video.id"
                class="grid-cell"
              >
                <VideoCard
                  :video="video"
                  :selected="selection.isSelected(video.id)"
                  :has-selection="selection.hasSelection.value"
                  :progress="getProgress(video)"
                  @click="onVideoClick"
                  @dblclick="onVideoDblClick"
                  @check="onCheckClick"
                  @preview="onPreviewOpen"
                  @preview-close="onPreviewClose"
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
          <VideoListRow
            v-for="video in videoList"
            :key="video.id"
            :video="video"
            :selected="selection.isSelected(video.id)"
            :has-selection="selection.hasSelection.value"
            :progress="getProgress(video)"
            @click="onVideoClick"
            @dblclick="onVideoDblClick"
            @check="(v, checked) => onListRowCheck(v, checked)"
            @menu="onCardMenu"
            @retry="onRetry"
          />
        </div>

        <!-- 空状态 -->
        <div v-if="!loading && videoList.length === 0" class="empty-wrap">
          <n-empty
            :description="hasAnyFilter ? '没有匹配的视频' : '还没有上传过视频'"
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
          <template #header>加载视频列表失败</template>
          <n-flex align="center" :wrap="false">
            <span style="flex: 1 1 auto;">{{ loadError }}</span>
            <n-button size="small" @click="loadVideoList">重试</n-button>
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
    <VideoFloatingActionBar
      :selected-count="selection.selectedCount.value"
      :cross-page-count="selection.crossPageSelectedCount.value"
      :collections="allCollections"
      @add-to-collections="onBatchAddToCollections"
      @change-visibility="onBatchChangeVisibility"
      @delete="onBatchDelete"
      @clear="selection.clearAll"
    />

    <!-- 编辑抽屉 -->
    <VideoEditDrawer
      v-model:show="drawerShow"
      :video="drawerVideo"
      :collections="allCollections"
      :has-prev="drawerHasPrev"
      :has-next="drawerHasNext"
      @navigate="onDrawerNavigate"
      @open-public="onDrawerOpenPublic"
      @delete="onDrawerDelete"
      @patched="onDrawerPatched"
      @collections-changed="onDrawerCollectionsChanged"
    />

    <!-- 悬停预览 popover -->
    <VideoHoverPreview
      v-if="state.hoverPreview"
      :visible="hoverPreviewVisible"
      :video="hoverPreviewVideo"
      :anchor-rect="hoverPreviewRect"
      @close="onPreviewClose"
      @keep-alive="() => { /* 鼠标进入 popover 自身时保持显示 */ }"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  NSpin,
  NEmpty,
  NPagination,
  NAlert,
  NButton,
  NFlex,
  NCheckbox,
  useMessage,
} from 'naive-ui'
import { useVideoThemeVars } from './composables/useVideoThemeVars'
import VideoFilterBar from './VideoFilterBar.vue'
import VideoCard from './VideoCard.vue'
import VideoListRow from './VideoListRow.vue'
import VideoFloatingActionBar from './VideoFloatingActionBar.vue'
import VideoEditDrawer from './VideoEditDrawer.vue'
import VideoHoverPreview from './VideoHoverPreview.vue'
import { useVideoQuery } from './composables/useVideoQuery'
import { useVideoSelection } from './composables/useVideoSelection'
import { getPublicSiteOrigin } from './composables/videoFormat'
import {
  fetchVideoList,
  fetchCollectionsIds,
  addVideosToCollections,
  removeVideosFromCollections,
  deleteVideos,
  updateVideo,
} from '../../api/manager'
import type { VideoItem } from '../../api/manager'
import { fetchProcessingTasks } from '../../api/task'
import { useCollectionStore } from '../../stores/collection'

const message = useMessage()
const router = useRouter()
const collectionStore = useCollectionStore()

// 见 composables/useVideoThemeVars 注释。
const themeCssVars = useVideoThemeVars()

const query = useVideoQuery()
const state = computed(() => query.state.value)
const selection = useVideoSelection()

// ---------- 数据 ----------
const videoList = ref<VideoItem[]>([])
const total = ref(0)
const loading = ref(false)
const loadError = ref('')
const allCollections = ref<{ id: number; name: string }[]>([])

// ---------- 任务进度（每 5s 拉一次）----------
const progressByHash = ref<Record<string, { status: string; progress?: number | null }>>({})
let progressTimer: number | null = null

async function refreshProgress() {
  try {
    const list = await fetchProcessingTasks()
    const map: Record<string, { status: string; progress?: number | null }> = {}
    for (const t of list as any[]) {
      if (!t?.hash) continue
      map[t.hash] = { status: t.status, progress: t.progress }
    }
    progressByHash.value = map
  } catch (_) { /* 忽略，定时器下个 tick 重试 */ }
}

/**
 * VideoItem 当前没暴露 hash（只暴露 uuid）。从 objectKey 抽 hash：
 * 上传约定 objectKey 含 hash（如 videos/{hash}/original/xxx）。
 */
function extractHash(v: VideoItem): string | null {
  const m = v.objectKey?.match(/videos\/([a-zA-Z0-9]+)\//)
  return m ? m[1] : null
}
function getProgress(v: VideoItem): number | null {
  const hash = extractHash(v)
  if (!hash) return null
  return progressByHash.value[hash]?.progress ?? null
}

// ---------- 派生状态 ----------
const failedCount = computed(() =>
  videoList.value.filter(
    (v) =>
      v.status === 'failed' ||
      v.status === 'ai_analyze_failed' ||
      v.status === 'transcode_failed',
  ).length
)
const dismissedFailedAlert = ref(false)
function filterFailedOnly() {
  query.setFilter({ status: 'failed' })
  dismissedFailedAlert.value = false
}

const hasAnyFilter = computed(
  () => !!state.value.keyword
    || !!state.value.status
    || !!state.value.visibility
    || !!state.value.hasLocation
    || state.value.collectionId != null
)

const filterBarState = computed(() => ({
  keyword: state.value.keyword,
  status: state.value.status,
  visibility: state.value.visibility,
  hasLocation: state.value.hasLocation,
  orderBy: state.value.orderBy,
  order: state.value.order,
  viewMode: state.value.viewMode,
  density: state.value.density,
  hoverPreview: state.value.hoverPreview,
  collectionId: state.value.collectionId,
}))

const paginationPage = computed({
  get: () => state.value.page,
  set: (p: number) => query.setFilter({ page: p }, false),
})

// 选中：当前页全选状态
const allCurrentSelected = computed(
  () => videoList.value.length > 0 && videoList.value.every((v) => selection.isSelected(v.id))
)
const someCurrentSelected = computed(() => videoList.value.some((v) => selection.isSelected(v.id)))

// drag-select 适配：把 drag-select 的 v-model 同步到 selection store
const dragSelectedIds = ref<number[]>([])
function onDragSelectChange(_: number[]) {
  // change 事件先于 v-model 更新，留给 watch 处理
}
watch(dragSelectedIds, (ids) => {
  // drag-select 在框选过程中持续更新 model；只有当用户真正完成（非空集）才一次性合并
  if (!ids || ids.length === 0) return
  const next = new Set(selection.selectedKeys.value)
  for (const id of ids) next.add(id)
  selection.setSelected(next)
  dragSelectedIds.value = []
})

// ---------- 数据加载 ----------
async function loadVideoList() {
  loading.value = true
  loadError.value = ''
  try {
    const params: any = {
      page: state.value.page,
      pageSize: state.value.pageSize,
      collectionId: state.value.collectionId ?? 0,
      keyword: state.value.keyword || undefined,
      status: state.value.status || undefined,
      visibility: state.value.visibility || undefined,
      hasLocation: state.value.hasLocation ?? undefined,
      orderBy: state.value.orderBy,
      order: state.value.order,
    }
    const resp = (await fetchVideoList(params)) as unknown as { total: number; data: VideoItem[] }
    videoList.value = resp.data ?? []
    total.value = resp.total ?? 0
    selection.setCurrentPage(videoList.value)
    // 同步 collection store（兼容侧边栏 / 其它页面）
    collectionStore.setCollection(state.value.collectionId)
  } catch (err: any) {
    loadError.value = err?.message ?? '未知错误'
    videoList.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

async function loadCollections() {
  try {
    const list = await fetchCollectionsIds()
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
    state.value.status,
    state.value.visibility,
    state.value.hasLocation,
    state.value.orderBy,
    state.value.order,
  ],
  () => loadVideoList(),
  { flush: 'post' }
)

// ---------- 卡片点击 / 选中 ----------
/**
 * 单击 / 双击区分：
 *  - ctrl/meta/shift 点击是选择操作，立即处理（多选 / 范围选不能延迟）；
 *  - 普通单击 → 250 ms 后才打开抽屉；如果这段时间内来一个 dblclick，就取消，
 *    改为打开公共站详情页。
 *
 * 时机选择：浏览器多次点击间隔默认 ~500 ms 才发 dblclick，但实际多数用户的
 * 双击间隔 < 250 ms。250 ms 是常见的 UX 折中——既能稳定捕到双击，
 * 又不会让单击响应肉眼可感。
 */
let pendingClickTimer: number | null = null
function clearPendingClick() {
  if (pendingClickTimer != null) {
    window.clearTimeout(pendingClickTimer)
    pendingClickTimer = null
  }
}
function onVideoClick(video: VideoItem, ev: MouseEvent) {
  if (ev.ctrlKey || ev.metaKey || ev.shiftKey) {
    selection.handleClick(video.id, {
      ctrlKey: ev.ctrlKey,
      metaKey: ev.metaKey,
      shiftKey: ev.shiftKey,
    })
    return
  }
  clearPendingClick()
  pendingClickTimer = window.setTimeout(() => {
    pendingClickTimer = null
    openDrawer(video)
  }, 250)
}
function onVideoDblClick(video: VideoItem) {
  clearPendingClick()
  openPublic(video)
}
function onCheckClick(video: VideoItem, _ev: MouseEvent) {
  selection.toggle(video.id)
}
function onListRowCheck(video: VideoItem, checked: boolean) {
  if (checked && !selection.isSelected(video.id)) selection.toggle(video.id)
  else if (!checked && selection.isSelected(video.id)) selection.toggle(video.id)
}
function onToggleAllPage(checked: boolean) {
  if (checked) selection.selectAllCurrentPage()
  else {
    const inPage = videoList.value.map((v) => v.id)
    selection.removeFromSelection(inPage)
  }
}

// ---------- 卡片菜单 ----------
function onCardMenu(video: VideoItem, action: string) {
  switch (action) {
    case 'edit': openDrawer(video); break
    case 'open-public': openPublic(video); break
    case 'set-cover':
      openDrawer(video)
      // TODO: 抽屉打开后定位到封面 tab
      break
    case 'copy-key':
      copyKey(video)
      break
    case 'delete':
      confirmDeleteOne(video)
      break
  }
}

function openPublic(video: VideoItem) {
  const origin = getPublicSiteOrigin()
  window.open(`${origin}/video/${video.uuid}`, '_blank')
}

async function copyKey(video: VideoItem) {
  try {
    await navigator.clipboard.writeText(video.objectKey)
    message.success('对象 Key 已复制')
  } catch (_) {
    message.warning('剪贴板不可用')
  }
}

async function confirmDeleteOne(video: VideoItem) {
  if (!window.confirm(`确定删除「${video.title || video.fileName}」？此操作不可恢复。`)) return
  try {
    await deleteVideos([video.id])
    message.success('已删除')
    selection.removeFromSelection([video.id])
    if (drawerVideo.value?.id === video.id) drawerShow.value = false
    await loadVideoList()
  } catch (err: any) {
    message.error(`删除失败：${err?.message ?? '未知错误'}`)
  }
}

async function onRetry(_video: VideoItem) {
  // TODO: 调用 retry-ai-analyze 或其它重试入口（依赖具体失败状态）
  message.info('重试已发送（待接入对应后端接口）')
}

// ---------- 抽屉编辑 ----------
const drawerShow = ref(false)
const drawerVideo = ref<VideoItem | null>(null)
const drawerIndex = computed(() =>
  drawerVideo.value ? videoList.value.findIndex((v) => v.id === drawerVideo.value!.id) : -1
)
const drawerHasPrev = computed(() => drawerIndex.value > 0)
const drawerHasNext = computed(() => drawerIndex.value >= 0 && drawerIndex.value < videoList.value.length - 1)

function openDrawer(video: VideoItem) {
  drawerVideo.value = video
  drawerShow.value = true
}
function onDrawerNavigate(delta: -1 | 1) {
  const idx = drawerIndex.value
  const next = idx + delta
  if (next < 0 || next >= videoList.value.length) return
  drawerVideo.value = videoList.value[next]
}
function onDrawerOpenPublic() {
  if (drawerVideo.value) openPublic(drawerVideo.value)
}
function onDrawerDelete() {
  if (drawerVideo.value) confirmDeleteOne(drawerVideo.value)
}
function onDrawerPatched(videoId: number, patch: Partial<VideoItem>) {
  // 列表本地 patch，避免抽屉里改了字段后必须刷整页
  const idx = videoList.value.findIndex((v) => v.id === videoId)
  if (idx >= 0) {
    videoList.value[idx] = { ...videoList.value[idx], ...patch }
    if (drawerVideo.value?.id === videoId) {
      drawerVideo.value = { ...drawerVideo.value, ...patch } as VideoItem
    }
  }
}
async function onDrawerCollectionsChanged(videoId: number, collectionIds: number[]) {
  if (!drawerVideo.value || drawerVideo.value.id !== videoId) return
  const before = new Set((drawerVideo.value.collections ?? []).map((c) => c.id))
  const after = new Set(collectionIds)
  const toAdd = collectionIds.filter((id) => !before.has(id))
  const toRemove = (drawerVideo.value.collections ?? []).filter((c) => !after.has(c.id)).map((c) => c.id)
  try {
    if (toAdd.length > 0) {
      await addVideosToCollections({ videoIds: [videoId], collectionIds: toAdd })
    }
    if (toRemove.length > 0) {
      await removeVideosFromCollections({ videoIds: [videoId], collectionIds: toRemove })
    }
    // 本地 patch collections 字段（取 allCollections 名称做近似）
    const newCollections = collectionIds.map((id) => {
      const c = allCollections.value.find((x) => x.id === id)
      return { id, name: c?.name ?? `#${id}`, description: '' }
    })
    onDrawerPatched(videoId, { collections: newCollections })
  } catch (err: any) {
    message.error(`合集更新失败：${err?.message ?? '未知错误'}`)
  }
}

// ---------- 悬停预览 ----------
const hoverPreviewVisible = ref(false)
const hoverPreviewVideo = ref<VideoItem | null>(null)
const hoverPreviewRect = ref<DOMRect | null>(null)

function onPreviewOpen(video: VideoItem, anchor: HTMLElement) {
  if (!state.value.hoverPreview) return
  hoverPreviewVideo.value = video
  hoverPreviewRect.value = anchor.getBoundingClientRect()
  hoverPreviewVisible.value = true
}
function onPreviewClose() {
  hoverPreviewVisible.value = false
}

// ---------- 批量操作 ----------
async function onBatchAddToCollections(collectionIds: number[]) {
  if (collectionIds.length === 0) return
  const ids = selection.selectedArray.value
  if (ids.length === 0) return
  try {
    await addVideosToCollections({ videoIds: ids, collectionIds })
    message.success(`已加入 ${collectionIds.length} 个合集`)
    await loadVideoList()
  } catch (err: any) {
    message.error(`加合集失败：${err?.message ?? '未知错误'}`)
  }
}

async function onBatchChangeVisibility(visibility: string) {
  const ids = selection.selectedArray.value
  if (ids.length === 0) return
  try {
    await Promise.all(
      ids.map((id) =>
        updateVideo(id, {
          title: '',
          description: '',
          shotAt: null,
          visibility,
        }).catch((e) => e)
      )
    )
    message.success(`已批量设置可见性为 ${visibility}`)
    await loadVideoList()
  } catch (err: any) {
    message.error(`批量改可见性失败：${err?.message ?? '未知错误'}`)
  }
}

async function onBatchDelete() {
  const ids = selection.selectedArray.value
  if (ids.length === 0) return
  try {
    await deleteVideos(ids)
    message.success(`已删除 ${ids.length} 个视频`)
    selection.clearAll()
    await loadVideoList()
  } catch (err: any) {
    message.error(`批量删除失败：${err?.message ?? '未知错误'}`)
  }
}

function goUpload() {
  router.push('/upload')
}

// ---------- 键盘快捷键 ----------
function onGlobalKey(ev: KeyboardEvent) {
  // 在 input / textarea 输入时不触发（除了 / 和 Esc）
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
    } else if (hoverPreviewVisible.value) {
      onPreviewClose()
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
    onBatchDelete()
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
  loadCollections()
  loadVideoList()
  refreshProgress()
  progressTimer = window.setInterval(refreshProgress, 5000)
  window.addEventListener('keydown', onGlobalKey)
})
onBeforeUnmount(() => {
  if (progressTimer) {
    window.clearInterval(progressTimer)
    progressTimer = null
  }
  // 卸载时清掉等待中的"延迟单击"，避免组件销毁后 timer 触发 openDrawer / 抛错
  clearPendingClick()
  window.removeEventListener('keydown', onGlobalKey)
})
</script>

<style scoped>
.video-list-page {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  /*
    页面底色：固定一档冷灰（#f5f6f8），让 #fff 卡片明显浮出来。
    项目当前固定浅主题（n-config-provider 没传 theme prop），不为了未来
    可能的深主题切换提前做媒体查询——那时再统一切回 var(--n-body-color)。
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

.grid-wrap {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
}
.density-compact .grid-wrap {
  gap: 10px;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
}
.density-spacious .grid-wrap {
  gap: 22px;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
}
.grid-cell {
  /* drag-select-option 默认 inline，强制 block 让 grid 正常排版 */
  display: block;
}

/*
  列表视图：整组行装在一个白卡片里（区别于网格视图的离散卡片）。
  行之间用 4px gap 而不是 1px divider —— 避免 hover / selected 行边框与
  divider 在 z 轴上打架；密度紧凑视觉上仍干净。
*/
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
