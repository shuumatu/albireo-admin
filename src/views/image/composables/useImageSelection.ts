import { computed, ref } from 'vue'
import type { ImageItem } from '../../../api/images'

/**
 * 图片管理页的多选状态。形态与 useVideoSelection 完全一致——
 * 都是面向"卡片网格 + 浮动操作栏"模式：
 *
 *  - 选中态贯穿翻页：selectedKeys 是 Set<number>，跨页保留；
 *  - 当前页的所有可见 ID 单独维护，让 UI 算出"全选当前页"按钮的 disabled 状态；
 *  - 区间选（Shift+点击）需要锚点：lastClickedId 记录上一次点的；
 *  - 当至少选中 1 个后，浮动操作栏挂出，避免"模式切换"的割裂感。
 *
 * 不抽 useMediaSelection<T> 公共版本：图片 / 视频字段差异目前只是 ID 类型（都是 number），
 * 但未来可能扩展到不同 ID 形态；先复制一份保持节奏，等多媒体场景沉淀后再统一。
 */
export function useImageSelection() {
  const selectedKeys = ref<Set<number>>(new Set())
  const lastClickedId = ref<number | null>(null)
  const currentPageIds = ref<number[]>([])

  const selectedArray = computed(() => Array.from(selectedKeys.value))
  const selectedCount = computed(() => selectedKeys.value.size)
  const hasSelection = computed(() => selectedKeys.value.size > 0)

  /** 当前页里被选中的 id；用于"含跨页 N 项"提示 */
  const inPageSelectedCount = computed(() => {
    let n = 0
    for (const id of currentPageIds.value) if (selectedKeys.value.has(id)) n++
    return n
  })

  /** "跨页"被选中（不在当前页）的 id 数 */
  const crossPageSelectedCount = computed(() => selectedCount.value - inPageSelectedCount.value)

  function setCurrentPage(items: ImageItem[]) {
    currentPageIds.value = items.map((v) => v.id)
  }

  function isSelected(id: number) {
    return selectedKeys.value.has(id)
  }

  /**
   * 主选中行为，处理 Ctrl/Cmd（toggle）、Shift（区间）、普通点击。
   * 返回是否消费了点击（false 表示调用方应继续走默认行为，比如打开抽屉）。
   */
  function handleClick(id: number, ev: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): boolean {
    const toggle = ev.ctrlKey || ev.metaKey
    const range = ev.shiftKey

    if (range && lastClickedId.value != null) {
      const ids = currentPageIds.value
      const a = ids.indexOf(lastClickedId.value)
      const b = ids.indexOf(id)
      if (a >= 0 && b >= 0) {
        const [from, to] = a < b ? [a, b] : [b, a]
        const next = new Set(selectedKeys.value)
        for (let i = from; i <= to; i++) next.add(ids[i])
        selectedKeys.value = next
        return true
      }
    }

    if (toggle) {
      const next = new Set(selectedKeys.value)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      selectedKeys.value = next
      lastClickedId.value = id
      return true
    }

    if (hasSelection.value) {
      const next = new Set(selectedKeys.value)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      selectedKeys.value = next
      lastClickedId.value = id
      return true
    }

    lastClickedId.value = id
    return false
  }

  function setSelected(ids: number[] | Set<number>) {
    selectedKeys.value = new Set(ids)
  }

  function toggle(id: number) {
    const next = new Set(selectedKeys.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    selectedKeys.value = next
    lastClickedId.value = id
  }

  function selectAllCurrentPage() {
    const next = new Set(selectedKeys.value)
    for (const id of currentPageIds.value) next.add(id)
    selectedKeys.value = next
  }

  function clearAll() {
    selectedKeys.value = new Set()
    lastClickedId.value = null
  }

  function removeFromSelection(ids: number[]) {
    if (selectedKeys.value.size === 0) return
    const next = new Set(selectedKeys.value)
    for (const id of ids) next.delete(id)
    selectedKeys.value = next
  }

  return {
    selectedKeys,
    selectedArray,
    selectedCount,
    hasSelection,
    inPageSelectedCount,
    crossPageSelectedCount,
    setCurrentPage,
    isSelected,
    handleClick,
    setSelected,
    toggle,
    selectAllCurrentPage,
    clearAll,
    removeFromSelection,
  }
}
