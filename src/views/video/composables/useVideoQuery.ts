import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { VideoListOrder, VideoListOrderBy } from '../../../api/manager'

/**
 * 视频管理页的查询条件 + URL 同步。
 *
 * 设计原则：
 *  - 所有"用户视角的状态"都同步到 query string，刷新 / 分享链接 / 浏览器返回都能保留筛选；
 *  - URL 变更走 router.replace（而非 push），避免每次输入搜索都把历史栈灌满；
 *  - keyword 用 350ms debounce 才同步到 URL（频繁打字不刷历史）。
 *
 * 状态契约：
 *  - keyword: 关键词（标题 / 文件名 / 描述模糊匹配，由后端处理）
 *  - status / visibility: 单选字符串（后端精确匹配）
 *  - orderBy / order: 排序键 + 方向，白名单由后端 VideoService 保护
 *  - page / pageSize: 分页
 *  - viewMode: 'list' | 'grid'，仅前端状态但也持久化以提升体感
 *  - density: 'compact' | 'cozy' | 'spacious'，影响网格列数 / 行高
 *  - hoverPreview: 是否启用悬停短预览，移动端 / 弱网默认关
 */
export type ViewMode = 'list' | 'grid'
export type DensityMode = 'compact' | 'cozy' | 'spacious'

/** 位置过滤三态。null = 不过滤；'yes' = 有位置；'no' = 无位置 */
export type HasLocationFilter = 'yes' | 'no' | null

export interface VideoQueryState {
  keyword: string
  status: string | null
  visibility: string | null
  /** 是否有 PostGIS 位置；'yes' / 'no' / null */
  hasLocation: HasLocationFilter
  /**
   * 合集筛选。null = 全部；0 在 URL 里被规整为 null。
   * 与 collectionStore.activeCollectionId 双向同步：URL 是更高优先级（刷新 / 分享 / 浏览器返回都靠它）。
   */
  collectionId: number | null
  orderBy: VideoListOrderBy
  order: VideoListOrder
  page: number
  pageSize: number
  viewMode: ViewMode
  density: DensityMode
  hoverPreview: boolean
}

const DEFAULT_STATE: VideoQueryState = {
  keyword: '',
  status: null,
  visibility: null,
  hasLocation: null,
  collectionId: null,
  orderBy: 'createdAt',
  order: 'desc',
  page: 1,
  pageSize: 20,
  viewMode: 'grid',
  density: 'cozy',
  hoverPreview: true,
}

const ALLOWED_ORDER_BY: VideoListOrderBy[] = ['createdAt', 'updatedAt', 'duration']
const ALLOWED_VIEW_MODE: ViewMode[] = ['list', 'grid']
const ALLOWED_DENSITY: DensityMode[] = ['compact', 'cozy', 'spacious']

function parseInitialState(query: Record<string, any>): VideoQueryState {
  const s: VideoQueryState = { ...DEFAULT_STATE }
  if (typeof query.q === 'string') s.keyword = query.q
  if (typeof query.status === 'string' && query.status) s.status = query.status
  if (typeof query.visibility === 'string' && query.visibility) s.visibility = query.visibility
  if (query.hasLocation === 'yes' || query.hasLocation === 'no') {
    s.hasLocation = query.hasLocation
  }
  const cid = Number(query.collectionId)
  if (Number.isFinite(cid) && cid > 0) s.collectionId = Math.floor(cid)
  if (typeof query.orderBy === 'string' && (ALLOWED_ORDER_BY as string[]).includes(query.orderBy)) {
    s.orderBy = query.orderBy as VideoListOrderBy
  }
  if (query.order === 'asc' || query.order === 'desc') s.order = query.order
  const page = Number(query.page)
  if (Number.isFinite(page) && page >= 1) s.page = Math.floor(page)
  const ps = Number(query.pageSize)
  if (Number.isFinite(ps) && ps >= 1 && ps <= 200) s.pageSize = Math.floor(ps)
  if (typeof query.view === 'string' && (ALLOWED_VIEW_MODE as string[]).includes(query.view)) {
    s.viewMode = query.view as ViewMode
  }
  if (typeof query.density === 'string' && (ALLOWED_DENSITY as string[]).includes(query.density)) {
    s.density = query.density as DensityMode
  }
  if (query.preview === '0') s.hoverPreview = false
  return s
}

function stateToQuery(s: VideoQueryState): Record<string, string> {
  const q: Record<string, string> = {}
  if (s.keyword) q.q = s.keyword
  if (s.status) q.status = s.status
  if (s.visibility) q.visibility = s.visibility
  if (s.hasLocation) q.hasLocation = s.hasLocation
  if (s.collectionId != null && s.collectionId > 0) q.collectionId = String(s.collectionId)
  if (s.orderBy !== DEFAULT_STATE.orderBy) q.orderBy = s.orderBy
  if (s.order !== DEFAULT_STATE.order) q.order = s.order
  if (s.page !== DEFAULT_STATE.page) q.page = String(s.page)
  if (s.pageSize !== DEFAULT_STATE.pageSize) q.pageSize = String(s.pageSize)
  if (s.viewMode !== DEFAULT_STATE.viewMode) q.view = s.viewMode
  if (s.density !== DEFAULT_STATE.density) q.density = s.density
  if (!s.hoverPreview) q.preview = '0'
  return q
}

export function useVideoQuery() {
  const route = useRoute()
  const router = useRouter()

  const state = ref<VideoQueryState>(parseInitialState(route.query as any))

  // keyword 单独走 debounce，避免输入时把 URL 更新成"每个按键一次 replace"
  let kwTimer: number | null = null
  const debouncedKeywordSync = () => {
    if (kwTimer) window.clearTimeout(kwTimer)
    kwTimer = window.setTimeout(() => {
      syncToUrl()
    }, 350)
  }

  function syncToUrl() {
    if (route.path !== '/manager/video') return
    const next = stateToQuery(state.value)
    const cur = route.query
    const sameKeys = Object.keys(next).length === Object.keys(cur).length
    const sameValues = Object.entries(next).every(([k, v]) => String((cur as any)[k] ?? '') === v)
    if (sameKeys && sameValues) return
    router.replace({ path: route.path, query: next }).catch(() => { /* 忽略导航错误 */ })
  }

  // 监听除 keyword 外字段，立即同步
  watch(
    () => [
      state.value.status,
      state.value.visibility,
      state.value.hasLocation,
      state.value.collectionId,
      state.value.orderBy,
      state.value.order,
      state.value.page,
      state.value.pageSize,
      state.value.viewMode,
      state.value.density,
      state.value.hoverPreview,
    ],
    () => syncToUrl(),
    { deep: false }
  )

  // keyword 单独 debounce
  watch(() => state.value.keyword, () => debouncedKeywordSync())

  // 浏览器后退 / 前进时（route.query 变了）回灌到 state
  watch(
    () => route.query,
    (q) => {
      if (route.path !== '/manager/video') return
      const next = parseInitialState(q as any)
      // 浅比较，避免互相触发
      const cur = state.value
      const isSame =
        cur.keyword === next.keyword &&
        cur.status === next.status &&
        cur.visibility === next.visibility &&
        cur.hasLocation === next.hasLocation &&
        cur.collectionId === next.collectionId &&
        cur.orderBy === next.orderBy &&
        cur.order === next.order &&
        cur.page === next.page &&
        cur.pageSize === next.pageSize &&
        cur.viewMode === next.viewMode &&
        cur.density === next.density &&
        cur.hoverPreview === next.hoverPreview
      if (!isSame) state.value = next
    }
  )

  /** 用户改筛选条件后通常想跳回第一页，避免出现"第 5 页但只有 3 页结果" */
  function setFilter(patch: Partial<VideoQueryState>, resetPage = true) {
    state.value = {
      ...state.value,
      ...patch,
      ...(resetPage ? { page: 1 } : {}),
    }
  }

  function clearAllFilters() {
    state.value = {
      ...state.value,
      keyword: '',
      status: null,
      visibility: null,
      hasLocation: null,
      collectionId: null,
      page: 1,
    }
  }

  /** 列表里激活的"筛选 chip"列表，便于 UI 一行里显示并允许点 X 单独清除 */
  const activeChips = computed(() => {
    const chips: { key: keyof VideoQueryState; label: string }[] = []
    if (state.value.keyword) chips.push({ key: 'keyword', label: `搜索：${state.value.keyword}` })
    if (state.value.status) chips.push({ key: 'status', label: `状态：${statusLabel(state.value.status)}` })
    if (state.value.visibility) chips.push({ key: 'visibility', label: `可见性：${visibilityLabel(state.value.visibility)}` })
    if (state.value.hasLocation) {
      chips.push({ key: 'hasLocation', label: `位置：${state.value.hasLocation === 'yes' ? '有' : '无'}` })
    }
    if (state.value.collectionId != null) chips.push({ key: 'collectionId', label: `合集：#${state.value.collectionId}` })
    return chips
  })

  function clearChip(key: keyof VideoQueryState) {
    if (key === 'keyword') setFilter({ keyword: '' })
    else if (key === 'status') setFilter({ status: null })
    else if (key === 'visibility') setFilter({ visibility: null })
    else if (key === 'hasLocation') setFilter({ hasLocation: null })
    else if (key === 'collectionId') setFilter({ collectionId: null })
  }

  return {
    state,
    setFilter,
    clearAllFilters,
    activeChips,
    clearChip,
  }
}

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    uploading: '上传中',
    pending: '待处理',
    processing: '处理中',
    transcoding: '转码中',
    ai_analyzing: 'AI 分析中',
    done: '已完成',
    failed: '失败',
    ai_analyze_failed: 'AI 分析失败',
    transcode_failed: '转码失败',
  }
  return map[s] ?? s
}

function visibilityLabel(v: string): string {
  if (v === 'private') return '私密'
  if (v === 'friends') return '好友可见'
  if (v === 'public') return '公开'
  return v
}
