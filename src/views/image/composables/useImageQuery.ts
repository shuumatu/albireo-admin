import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { ImageListOrder, ImageListOrderBy } from '../../../api/images'

/**
 * 图片管理页的查询条件 + URL 同步。
 *
 * 设计与 useVideoQuery 对齐：所有"用户视角的状态"都同步到 query string，刷新 / 分享链接 / 浏览器返回都能保留筛选；
 *  - URL 变更走 router.replace，避免每次输入搜索都把历史栈灌满；
 *  - keyword 用 350ms debounce 才同步到 URL；
 *
 * 与 useVideoQuery 的差异：
 *  - 图片没有 visibility，但多了一个 type（photo / cover / other）业务分类；
 *  - 图片管理"默认只看 photo"——cover/poster/avatar 之类多由系统流程产出，
 *    平时维护时反而是噪声。所以 DEFAULT_STATE.type = 'photo'，URL 上无 type 参数时回归 photo；
 *    若用户主动切到"全部"，URL 上写 type=all 显式表达"我要看所有类型"，这样
 *    刷新 / 分享链接才能保留这个意图。
 *  - 排序键白名单：createdAt / updatedAt / shotAt；
 *  - 不需要 hoverPreview（图片无视频预览语义）。
 *
 * 共享字段：hasLocation（'yes' / 'no' / null）——便于运营巡检"无位置图"。
 */
export type ViewMode = 'list' | 'grid'
export type DensityMode = 'compact' | 'cozy' | 'spacious'

/** 位置过滤三态。null = 不过滤；'yes' = 有位置；'no' = 无位置 */
export type HasLocationFilter = 'yes' | 'no' | null

export interface ImageQueryState {
  keyword: string
  /**
   * 业务类型 photo/cover/other。
   * null 表示"全部类型"——用户主动选择，URL 上以 type=all 表达。
   * 默认值 'photo'：管理页只关注用户上传的照片，不被封面/海报等系统图刷屏。
   */
  type: string | null
  /** 处理状态精确匹配 */
  status: string | null
  /** 是否有 PostGIS 位置；'yes' / 'no' / null */
  hasLocation: HasLocationFilter
  /**
   * 合集筛选。null = 全部；0 在 URL 里被规整为 null。
   * 与 collectionStore.activeCollectionId 双向同步：URL 是更高优先级。
   */
  collectionId: number | null
  orderBy: ImageListOrderBy
  order: ImageListOrder
  page: number
  pageSize: number
  viewMode: ViewMode
  density: DensityMode
}

const DEFAULT_STATE: ImageQueryState = {
  keyword: '',
  type: 'photo',
  status: null,
  hasLocation: null,
  collectionId: null,
  orderBy: 'createdAt',
  order: 'desc',
  page: 1,
  pageSize: 20,
  viewMode: 'grid',
  density: 'cozy',
}

const ALLOWED_ORDER_BY: ImageListOrderBy[] = ['createdAt', 'updatedAt', 'shotAt']
const ALLOWED_VIEW_MODE: ViewMode[] = ['list', 'grid']
const ALLOWED_DENSITY: DensityMode[] = ['compact', 'cozy', 'spacious']
const ALLOWED_TYPE: string[] = ['photo', 'cover', 'other']

function parseInitialState(query: Record<string, any>): ImageQueryState {
  const s: ImageQueryState = { ...DEFAULT_STATE }
  if (typeof query.q === 'string') s.keyword = query.q

  // type 三态：未传 → 'photo'（默认）；'all' → null（用户显式选全部）；其它合法值 → 原样
  if (typeof query.type === 'string') {
    if (query.type === 'all') {
      s.type = null
    } else if ((ALLOWED_TYPE as string[]).includes(query.type)) {
      s.type = query.type
    }
    // 非法值忽略，保持 DEFAULT_STATE.type='photo'
  }

  if (typeof query.status === 'string' && query.status) s.status = query.status
  if (query.hasLocation === 'yes' || query.hasLocation === 'no') {
    s.hasLocation = query.hasLocation
  }

  const cid = Number(query.collectionId)
  if (Number.isFinite(cid) && cid > 0) s.collectionId = Math.floor(cid)
  if (typeof query.orderBy === 'string' && (ALLOWED_ORDER_BY as string[]).includes(query.orderBy)) {
    s.orderBy = query.orderBy as ImageListOrderBy
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
  return s
}

function stateToQuery(s: ImageQueryState): Record<string, string> {
  const q: Record<string, string> = {}
  if (s.keyword) q.q = s.keyword

  // type 编码：默认 photo 不写；null（"全部"）写 type=all；其它原样
  if (s.type === null) {
    q.type = 'all'
  } else if (s.type !== DEFAULT_STATE.type) {
    q.type = s.type
  }

  if (s.status) q.status = s.status
  if (s.hasLocation) q.hasLocation = s.hasLocation
  if (s.collectionId != null && s.collectionId > 0) q.collectionId = String(s.collectionId)
  if (s.orderBy !== DEFAULT_STATE.orderBy) q.orderBy = s.orderBy
  if (s.order !== DEFAULT_STATE.order) q.order = s.order
  if (s.page !== DEFAULT_STATE.page) q.page = String(s.page)
  if (s.pageSize !== DEFAULT_STATE.pageSize) q.pageSize = String(s.pageSize)
  if (s.viewMode !== DEFAULT_STATE.viewMode) q.view = s.viewMode
  if (s.density !== DEFAULT_STATE.density) q.density = s.density
  return q
}

export function useImageQuery() {
  const route = useRoute()
  const router = useRouter()

  const state = ref<ImageQueryState>(parseInitialState(route.query as any))

  let kwTimer: number | null = null
  const debouncedKeywordSync = () => {
    if (kwTimer) window.clearTimeout(kwTimer)
    kwTimer = window.setTimeout(() => {
      syncToUrl()
    }, 350)
  }

  function syncToUrl() {
    if (route.path !== '/manager/image') return
    const next = stateToQuery(state.value)
    const cur = route.query
    const sameKeys = Object.keys(next).length === Object.keys(cur).length
    const sameValues = Object.entries(next).every(([k, v]) => String((cur as any)[k] ?? '') === v)
    if (sameKeys && sameValues) return
    router.replace({ path: route.path, query: next }).catch(() => { /* 忽略导航错误 */ })
  }

  watch(
    () => [
      state.value.type,
      state.value.status,
      state.value.hasLocation,
      state.value.collectionId,
      state.value.orderBy,
      state.value.order,
      state.value.page,
      state.value.pageSize,
      state.value.viewMode,
      state.value.density,
    ],
    () => syncToUrl(),
    { deep: false }
  )

  watch(() => state.value.keyword, () => debouncedKeywordSync())

  // 浏览器后退 / 前进时（route.query 变了）回灌到 state
  watch(
    () => route.query,
    (q) => {
      if (route.path !== '/manager/image') return
      const next = parseInitialState(q as any)
      const cur = state.value
      const isSame =
        cur.keyword === next.keyword &&
        cur.type === next.type &&
        cur.status === next.status &&
        cur.hasLocation === next.hasLocation &&
        cur.collectionId === next.collectionId &&
        cur.orderBy === next.orderBy &&
        cur.order === next.order &&
        cur.page === next.page &&
        cur.pageSize === next.pageSize &&
        cur.viewMode === next.viewMode &&
        cur.density === next.density
      if (!isSame) state.value = next
    }
  )

  /** 用户改筛选条件后通常想跳回第一页 */
  function setFilter(patch: Partial<ImageQueryState>, resetPage = true) {
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
      // 清除全部筛选 = 回归默认 photo（管理页核心场景），而不是 null（"全部"）
      type: DEFAULT_STATE.type,
      status: null,
      hasLocation: null,
      collectionId: null,
      page: 1,
    }
  }

  /** 列表里激活的"筛选 chip"列表，便于 UI 一行里显示并允许点 X 单独清除 */
  const activeChips = computed(() => {
    const chips: { key: keyof ImageQueryState; label: string }[] = []
    if (state.value.keyword) chips.push({ key: 'keyword', label: `搜索：${state.value.keyword}` })
    // type=photo 是默认值不显示 chip；null（"全部"）和其它非默认值都要显示
    if (state.value.type !== DEFAULT_STATE.type) {
      chips.push({ key: 'type', label: `类型：${typeLabel(state.value.type)}` })
    }
    if (state.value.status) chips.push({ key: 'status', label: `状态：${statusLabel(state.value.status)}` })
    if (state.value.hasLocation) {
      chips.push({ key: 'hasLocation', label: `位置：${state.value.hasLocation === 'yes' ? '有' : '无'}` })
    }
    if (state.value.collectionId != null) chips.push({ key: 'collectionId', label: `合集：#${state.value.collectionId}` })
    return chips
  })

  function clearChip(key: keyof ImageQueryState) {
    if (key === 'keyword') setFilter({ keyword: '' })
    // 单独清掉 type chip → 回归默认 'photo'，而不是 null
    else if (key === 'type') setFilter({ type: DEFAULT_STATE.type })
    else if (key === 'status') setFilter({ status: null })
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
    done: '已完成',
    failed: '失败',
  }
  return map[s] ?? s
}

function typeLabel(t: string | null): string {
  if (t === null) return '全部'
  const map: Record<string, string> = {
    photo: '照片',
    cover: '封面',
    other: '其他',
  }
  return map[t] ?? t
}
