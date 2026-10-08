<template>
  <section class="admin-page tag-page">
    <header class="admin-page-header">
      <div>
        <div class="page-eyebrow">内容整理</div>
        <h1>标签管理</h1>
        <p>快速找到、命名和整理标签，让每一段内容都有迹可循。</p>
      </div>
      <div class="header-actions">
        <n-button :loading="loading" :disabled="busy || editorOpen" @click="fetchTags">
          <template #icon><n-icon :component="RefreshOutline" /></template>刷新
        </n-button>
        <n-button type="primary" :disabled="!hasLoaded || loading || busy || editorOpen" @click="openCreate">
          <template #icon><n-icon :component="AddOutline" /></template>新建标签
        </n-button>
      </div>
    </header>

    <div class="tag-overview" aria-label="按标签使用情况筛选">
      <button v-for="metric in metrics" :key="metric.key" type="button" class="metric-card"
        :class="{ 'is-active': usageFilter === metric.key }" :aria-pressed="usageFilter === metric.key"
        :disabled="loading || busy || editorOpen" @click="usageFilter = metric.key">
        <span class="metric-icon"><n-icon :component="metric.icon" :size="21" /></span>
        <span class="metric-content"><span class="metric-label">{{ metric.label }}</span><strong>{{ hasLoaded ? metric.count.toLocaleString() : '—' }}</strong></span>
        <span class="metric-hint">{{ metric.hint }}<n-icon :component="ArrowForwardOutline" :size="14" /></span>
      </button>
    </div>

    <n-alert v-if="loadError" type="error" :bordered="false" class="page-alert" role="alert">
      {{ loadError }}
      <n-button text type="error" :disabled="loading || busy || editorOpen" @click="fetchTags">重新加载</n-button>
    </n-alert>

    <section v-if="showCreate" class="admin-panel create-panel" aria-labelledby="create-label">
      <div class="create-heading"><span class="create-icon"><n-icon :component="AddOutline" :size="20" /></span><div><h2 id="create-label">新建标签</h2><p>输入名称后按 Enter 创建，Esc 取消。</p></div></div>
      <form class="create-form" @submit.prevent="submitCreate">
        <div class="create-input-wrap">
          <n-input ref="createInput" v-model:value="createName" placeholder="例如：旅行、日常、灵感"
            :disabled="saving" :status="createError ? 'error' : undefined"
            :input-props="{ 'aria-label': '新标签名称', 'aria-describedby': 'create-feedback', 'aria-invalid': !!createError }"
            @update:value="createError = ''" @keydown="(event: KeyboardEvent) => onEditorKeydown(event, closeCreate)">
            <template #suffix><span class="character-count">{{ nameLength(createName) }}/50</span></template>
          </n-input>
          <p id="create-feedback" class="input-feedback" :class="{ 'is-error': createError }" :role="createError ? 'alert' : undefined">{{ createError || '名称须唯一，最多 50 个字符。' }}</p>
        </div>
        <n-button type="primary" attr-type="submit" :loading="saving">创建标签</n-button>
        <n-button :disabled="saving" @click="closeCreate">取消</n-button>
      </form>
    </section>

    <section class="admin-panel workspace-panel" aria-labelledby="tag-list-heading" :aria-busy="loading">
      <div class="workspace-heading">
        <div class="workspace-title"><h2 id="tag-list-heading">{{ usageFilter === 'unused' ? '未使用标签' : usageFilter === 'used' ? '已使用标签' : '全部标签' }}</h2><span class="result-count" aria-live="polite">{{ hasLoaded ? filteredTags.length : '—' }} 个</span></div>
        <span class="workspace-hint">{{ editorOpen ? '保存或取消当前编辑后，可继续筛选和选择' : '点击名称即可重命名 · 勾选标签可批量整理' }}</span>
      </div>
      <div class="workspace-toolbar">
        <n-input v-model:value="keyword" placeholder="搜索标签名称…" clearable class="tag-search" :disabled="busy || editorOpen"
          :input-props="{ 'aria-label': '搜索标签名称' }">
          <template #prefix><n-icon :component="SearchOutline" /></template>
        </n-input>
        <div class="sort-control"><span id="tag-sort-label">排序</span><n-select v-model:value="sort" :options="sortOptions" :disabled="busy || editorOpen" aria-labelledby="tag-sort-label" class="sort-select" /></div>
        <n-button v-if="hasFilters" quaternary :disabled="busy || editorOpen" @click="resetFilters">清除筛选</n-button>
      </div>

      <div v-if="hasLoaded && allTags.length" class="selection-toolbar" :class="{ 'has-selection': selectedIds.length > 0 }" role="group" aria-label="批量整理标签">
        <n-checkbox :checked="isPageSelected" :indeterminate="isPagePartlySelected" :disabled="!visibleTags.length || loading || busy || editorOpen" @update:checked="togglePage">本页全选</n-checkbox>
        <template v-if="selectedIds.length">
          <span class="selection-summary" aria-live="polite">已选 <strong>{{ selectedIds.length }}</strong> 个<span v-if="offPageSelected">（其中 {{ offPageSelected }} 个在其他页）</span></span>
          <n-button size="small" quaternary :disabled="busy" @click="selectedIds = []">取消选择</n-button>
          <n-button size="small" type="error" secondary class="batch-delete" :disabled="loading || busy || editorOpen" @click="requestDelete(selectedTags)">
            <template #icon><n-icon :component="TrashOutline" /></template>删除所选
          </n-button>
        </template>
        <span v-else class="selection-hint">{{ usageFilter === 'unused' ? '这些标签目前没有关联视频，可按需清理。' : '按住 Ctrl / ⌘ 点击标签名称，也可以快速选择。' }}</span>
      </div>

      <div v-if="loading && !hasLoaded" class="tag-grid skeleton-grid" aria-label="正在加载标签">
        <n-skeleton v-for="index in 12" :key="index" height="116px" :sharp="false" />
      </div>
      <div v-else-if="!filteredTags.length" class="empty-state">
        <span class="empty-icon"><n-icon :component="hasFilters ? SearchOutline : PricetagsOutline" :size="30" /></span>
        <h3>{{ !hasLoaded && loadError ? '标签暂时无法加载' : hasFilters ? '没有符合条件的标签' : '从第一个标签开始整理' }}</h3>
        <p>{{ !hasLoaded && loadError ? '请重新加载后再进行管理。' : hasFilters ? '试试其他关键词，或清除筛选查看全部标签。' : '为视频添加主题、地点或人物标签，之后查找会更轻松。' }}</p>
        <n-button v-if="hasFilters" :disabled="busy || editorOpen" @click="resetFilters">清除筛选</n-button>
        <n-button v-else-if="hasLoaded" type="primary" :disabled="busy || editorOpen" @click="openCreate">新建标签</n-button>
        <n-button v-else :loading="loading" @click="fetchTags">重新加载</n-button>
      </div>
      <div v-else class="tag-grid" :class="{ 'is-loading': loading }">
        <article v-for="tag in visibleTags" :key="tag.id" class="tag-card"
          :class="{ 'is-selected': selectedSet.has(tag.id), 'is-editing': editingId === tag.id, 'is-recent': recentlyChangedId === tag.id }">
          <template v-if="editingId === tag.id">
            <form class="rename-form" @submit.prevent="submitRename(tag)">
              <label :for="'rename-tag-' + tag.id" class="rename-label">重命名标签</label>
              <n-input ref="renameInputs" v-model:value="editName" size="small" :disabled="saving" :status="editError ? 'error' : undefined"
                :input-props="{ id: 'rename-tag-' + tag.id, 'aria-label': '标签新名称', 'aria-describedby': 'rename-feedback-' + tag.id, 'aria-invalid': !!editError }"
                @update:value="editError = ''" @keydown="(event: KeyboardEvent) => onEditorKeydown(event, cancelRename)" />
              <p :id="'rename-feedback-' + tag.id" class="input-feedback" :class="{ 'is-error': editError }" :role="editError ? 'alert' : undefined">{{ editError || '最多 50 个字符 · 已输入 ' + nameLength(editName) + ' 个' }}</p>
              <div class="rename-actions"><n-button size="tiny" :disabled="saving" @click="cancelRename">取消</n-button><n-button size="tiny" type="primary" attr-type="submit" :loading="saving">保存</n-button></div>
            </form>
          </template>
          <template v-else>
            <div class="tag-card-main">
              <n-checkbox :checked="selectedSet.has(tag.id)" :disabled="loading || busy || editorOpen" :aria-label="'选择标签 ' + tag.name" @update:checked="(checked: boolean) => toggleTag(tag.id, checked)" />
              <button :id="'tag-name-' + tag.id" type="button" class="tag-name" :title="'重命名：' + tag.name" :aria-label="'重命名标签 ' + tag.name"
                :disabled="loading || busy || editorOpen" @click="onNameClick(tag, $event)"><span class="tag-hash" aria-hidden="true">#</span><n-highlight :text="tag.name" :patterns="keyword.trim() ? [keyword.trim()] : []" /></button>
            </div>
            <div class="tag-card-footer">
              <span class="usage-label" :class="{ 'is-unused': tagUsage(tag) === 0 }"><span class="usage-dot" />{{ usageText(tag) }}</span>
              <n-button quaternary size="tiny" class="tag-delete" :disabled="loading || busy || editorOpen" :aria-label="'删除标签 ' + tag.name" @click="requestDelete([tag])"><template #icon><n-icon :component="TrashOutline" :size="15" /></template></n-button>
            </div>
          </template>
        </article>
      </div>

      <footer class="workspace-footer">
        <span class="range-label" aria-live="polite">{{ filteredTags.length ? '显示 ' + rangeStart + '–' + rangeEnd + '，共 ' + filteredTags.length + ' 个标签' : '共 0 个标签' }}</span>
        <n-pagination v-if="filteredTags.length" v-model:page="page" :page-size="pageSize" :item-count="filteredTags.length" :page-sizes="[24, 48, 96]" show-size-picker :page-slot="5" :disabled="loading || busy || editorOpen" @update:page-size="changePageSize" />
      </footer>
    </section>
    <p class="page-footnote"><n-icon :component="InformationCircleOutline" :size="15" />使用情况按关联视频统计；删除标签会移除视频上的标签关联，视频文件不受影响。<span v-if="unknownCount">另有 {{ unknownCount }} 个标签的使用情况未知。</span></p>
  </section>

  <n-modal v-model:show="showDelete" preset="card" title="删除标签" class="delete-modal" :style="{ width: '480px' }" :mask-closable="!deleting" :closable="!deleting" :close-on-esc="!deleting" @after-leave="clearDeleteState">
    <n-alert :type="deleteError ? 'error' : 'warning'" :bordered="false" role="alert">{{ deleteError || '删除后无法撤销。关联视频上的这些标签也会移除，视频文件会保留。' }}</n-alert>
    <p class="delete-summary">即将删除 <strong>{{ deleteTargets.length }}</strong> 个标签<span v-if="deleteUsageCount">，涉及 {{ deleteUsageCount }} 条视频标签关联（同一视频可能重复计数）</span>。</p>
    <div class="delete-tag-list"><n-tag v-for="tag in deleteTargets" :key="tag.id" :bordered="false" type="default" :title="tag.name">{{ tag.name }}</n-tag></div>
    <p v-if="deleteTargets.some(tag => tagUsage(tag) === null)" class="delete-note">部分标签的使用情况未知，删除前请确认这些标签不再需要。</p>
    <div v-if="deleting" class="delete-progress" role="status">正在处理 {{ deleteCompleted }} / {{ deleteTotal }} … 请稍候。</div>
    <template #action><div class="delete-actions"><n-button :disabled="deleting" @click="showDelete = false">{{ deleteError ? '稍后处理' : '取消' }}</n-button><n-button type="error" :loading="deleting" :disabled="!deleteTargets.length" @click="confirmDelete">{{ deleteError ? '重试删除 ' + deleteTargets.length + ' 个标签' : '删除 ' + deleteTargets.length + ' 个标签' }}</n-button></div></template>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useMessage, type InputInst } from 'naive-ui'
import { AddOutline, RefreshOutline, SearchOutline, PricetagsOutline, CheckmarkCircleOutline, FileTrayOutline, TrashOutline, ArrowForwardOutline, InformationCircleOutline } from '@vicons/ionicons5'
import { fetchTags as apiFetchTags, createTag, updateTag, deleteTag, type TagItem } from '../api/tags'
import { filterAndSortTags, tagUsage, validateTagName, type TagUsageFilter, type TagSort } from '../utils/tagWorkspace'

const message = useMessage()
const allTags = ref<TagItem[]>([])
const hasLoaded = ref(false)
const loading = ref(false)
const loadError = ref('')
const keyword = ref('')
const usageFilter = ref<TagUsageFilter>('all')
const sort = ref<TagSort>('usage-desc')
const page = ref(1)
const pageSize = ref(24)
const selectedIds = ref<number[]>([])
const showCreate = ref(false)
const createName = ref('')
const createError = ref('')
const createInput = ref<InputInst | null>(null)
const editingId = ref<number | null>(null)
const editName = ref('')
const editError = ref('')
const renameInputs = ref<InputInst[]>([])
const saving = ref(false)
const recentlyChangedId = ref<number | null>(null)
const showDelete = ref(false)
const deleteTargets = ref<TagItem[]>([])
const deleteError = ref('')
const deleting = ref(false)
const deleteCompleted = ref(0)
const deleteTotal = ref(0)
let requestId = 0

const busy = computed(() => saving.value || deleting.value)
const editorOpen = computed(() => showCreate.value || editingId.value !== null)
const selectedSet = computed(() => new Set(selectedIds.value))
const selectedTags = computed(() => allTags.value.filter(tag => selectedSet.value.has(tag.id)))
const filteredTags = computed(() => filterAndSortTags(allTags.value, keyword.value, usageFilter.value, sort.value))
const visibleTags = computed(() => filteredTags.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
const hasFilters = computed(() => !!keyword.value.trim() || usageFilter.value !== 'all')
const usedCount = computed(() => allTags.value.filter(tag => (tagUsage(tag) ?? 0) > 0).length)
const unusedCount = computed(() => allTags.value.filter(tag => tagUsage(tag) === 0).length)
const unknownCount = computed(() => allTags.value.length - usedCount.value - unusedCount.value)
const metrics = computed(() => [
  { key: 'all' as const, label: '全部标签', count: allTags.value.length, hint: '查看全部', icon: PricetagsOutline },
  { key: 'used' as const, label: '已使用', count: usedCount.value, hint: '正在关联视频', icon: CheckmarkCircleOutline },
  { key: 'unused' as const, label: '未使用', count: unusedCount.value, hint: '按需整理', icon: FileTrayOutline },
])
const sortOptions = [
  { label: '关联视频：多 → 少', value: 'usage-desc' },
  { label: '关联视频：少 → 多', value: 'usage-asc' },
  { label: '名称：正序', value: 'name-asc' },
  { label: '名称：倒序', value: 'name-desc' },
]
const pageSelectedCount = computed(() => visibleTags.value.filter(tag => selectedSet.value.has(tag.id)).length)
const isPageSelected = computed(() => visibleTags.value.length > 0 && pageSelectedCount.value === visibleTags.value.length)
const isPagePartlySelected = computed(() => pageSelectedCount.value > 0 && !isPageSelected.value)
const offPageSelected = computed(() => selectedIds.value.length - pageSelectedCount.value)
const rangeStart = computed(() => (page.value - 1) * pageSize.value + 1)
const rangeEnd = computed(() => Math.min(page.value * pageSize.value, filteredTags.value.length))
const deleteUsageCount = computed(() => deleteTargets.value.reduce((count, tag) => count + (tagUsage(tag) ?? 0), 0))

watch([keyword, usageFilter], () => { page.value = 1; selectedIds.value = []; recentlyChangedId.value = null }, { flush: 'sync' })
watch(sort, () => { page.value = 1 }, { flush: 'sync' })
watch(() => filteredTags.value.length, () => { page.value = Math.min(page.value, Math.max(1, Math.ceil(filteredTags.value.length / pageSize.value))) }, { flush: 'sync' })

function nameLength(name: string) { return Array.from(name.trim()).length }
function onEditorKeydown(event: KeyboardEvent, cancel: () => void) {
  if (event.isComposing || event.keyCode === 229) {
    if (event.key === 'Enter') event.preventDefault()
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    cancel()
  }
}
function usageText(tag: TagItem) {
  const count = tagUsage(tag)
  return count === null ? '使用情况未知' : count === 0 ? '未关联视频' : count.toLocaleString() + ' 个视频'
}
function errorText(error: unknown, fallback: string) {
  // Service response validators provide actionable errors; transport failures use plain guidance.
  return error instanceof Error && !('isAxiosError' in error) ? error.message : fallback
}
async function fetchTags() {
  const current = ++requestId
  loading.value = true
  loadError.value = ''
  try {
    const tags = await apiFetchTags()
    if (current !== requestId) return
    allTags.value = tags
    hasLoaded.value = true
    const available = new Set(tags.map(tag => tag.id))
    selectedIds.value = selectedIds.value.filter(id => available.has(id))
  } catch {
    if (current === requestId) loadError.value = hasLoaded.value ? '刷新失败，当前保留上次加载的标签。请检查网络后重试。' : '标签加载失败，请检查网络后重试。'
  } finally { if (current === requestId) loading.value = false }
}
function resetFilters() { keyword.value = ''; usageFilter.value = 'all' }
function changePageSize(size: number) { pageSize.value = size; page.value = 1 }
function toggleTag(id: number, checked: boolean) {
  if (busy.value || editorOpen.value || loading.value) return
  selectedIds.value = checked ? [...new Set([...selectedIds.value, id])] : selectedIds.value.filter(value => value !== id)
}
function togglePage(checked: boolean) {
  const ids = new Set(visibleTags.value.map(tag => tag.id))
  selectedIds.value = checked ? [...new Set([...selectedIds.value, ...ids])] : selectedIds.value.filter(id => !ids.has(id))
}
async function openCreate() {
  if (busy.value || editorOpen.value) return
  selectedIds.value = []
  createName.value = ''
  createError.value = ''
  showCreate.value = true
  await nextTick()
  createInput.value?.focus()
}
function closeCreate() { if (!saving.value) showCreate.value = false }
async function onNameClick(tag: TagItem, event: MouseEvent) {
  if (event.ctrlKey || event.metaKey) { toggleTag(tag.id, !selectedSet.value.has(tag.id)); return }
  selectedIds.value = []
  editingId.value = tag.id
  editName.value = tag.name
  editError.value = ''
  await nextTick()
  renameInputs.value[0]?.focus()
  renameInputs.value[0]?.select()
}
function cancelRename() {
  if (saving.value) return
  const id = editingId.value
  editingId.value = null
  void nextTick(() => document.getElementById('tag-name-' + id)?.focus({ preventScroll: true }))
}
function upsertTag(tag: TagItem) {
  const index = allTags.value.findIndex(item => item.id === tag.id)
  if (index < 0) allTags.value = [...allTags.value, tag]
  else allTags.value = allTags.value.map(item => item.id === tag.id ? { ...item, ...tag } : item)
}
async function revealTag(id: number) {
  if (!filteredTags.value.some(tag => tag.id === id)) resetFilters()
  recentlyChangedId.value = id
  const index = filteredTags.value.findIndex(tag => tag.id === id)
  if (index >= 0) page.value = Math.floor(index / pageSize.value) + 1
  await nextTick()
  const button = document.getElementById('tag-name-' + id)
  button?.focus({ preventScroll: true })
  button?.scrollIntoView({ block: 'nearest', behavior: 'auto' })
}
async function submitCreate() {
  if (saving.value) return
  createError.value = validateTagName(createName.value, allTags.value)
  if (createError.value) { createInput.value?.focus(); return }
  saving.value = true
  try {
    const tag = await createTag({ name: createName.value.trim() })
    upsertTag(tag)
    showCreate.value = false
    message.success('已创建标签「' + tag.name + '」')
    await fetchTags()
    saving.value = false
    await revealTag(tag.id)
  } catch (error) { createError.value = errorText(error, '创建失败，请检查网络后重试。') }
  finally { saving.value = false }
}
async function submitRename(tag: TagItem) {
  if (saving.value) return
  editError.value = validateTagName(editName.value, allTags.value, tag.id)
  if (editError.value) return
  if (editName.value.trim() === tag.name) { cancelRename(); return }
  saving.value = true
  try {
    const updated = await updateTag(tag.id, { name: editName.value.trim() })
    upsertTag(updated)
    editingId.value = null
    message.success('标签名称已更新')
    await fetchTags()
    saving.value = false
    await revealTag(tag.id)
  } catch (error) { editError.value = errorText(error, '保存失败，请检查网络或确认名称是否已存在。') }
  finally { saving.value = false }
}
function requestDelete(tags: TagItem[]) {
  if (busy.value || editorOpen.value || !tags.length) return
  deleteTargets.value = [...tags]
  deleteError.value = ''
  showDelete.value = true
}
function clearDeleteState() { deleteTargets.value = []; deleteError.value = '' }
async function confirmDelete() {
  if (deleting.value || !deleteTargets.value.length) return
  deleting.value = true
  deleteError.value = ''
  deleteCompleted.value = 0
  const targets = [...deleteTargets.value]
  deleteTotal.value = targets.length
  const failed: TagItem[] = []
  for (const tag of targets) {
    try {
      await deleteTag(tag.id)
      allTags.value = allTags.value.filter(item => item.id !== tag.id)
      selectedIds.value = selectedIds.value.filter(id => id !== tag.id)
    } catch { failed.push(tag) }
    finally { deleteCompleted.value++ }
  }
  const succeeded = targets.length - failed.length
  if (succeeded) message.success('已删除 ' + succeeded + ' 个标签')
  if (failed.length) {
    deleteTargets.value = failed
    selectedIds.value = failed.map(tag => tag.id)
    deleteError.value = (succeeded ? succeeded + ' 个已删除，' : '') + failed.length + ' 个删除失败。已保留失败项，可重试或稍后处理。'
  } else showDelete.value = false
  await fetchTags()
  deleting.value = false
}
onMounted(fetchTags)
</script>

<style scoped>
.tag-page { max-width: 1480px; }
.page-eyebrow { color: var(--admin-accent); font-size: 11px; letter-spacing: 2px; margin-bottom: 5px; font-weight: 600; }
.header-actions { display: flex; gap: 10px; }
.tag-overview { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin-bottom: 24px; }
.metric-card { position: relative; display: flex; align-items: center; gap: 15px; text-align: left; padding: 21px; border: 1px solid var(--admin-border); border-radius: 12px; background: var(--admin-surface); color: var(--admin-text); transition: border-color .18s, background .18s; }
.metric-card:hover:not(:disabled) { border-color: var(--admin-accent); background: var(--admin-hover); }
.metric-card.is-active { background: var(--admin-accent-soft); border-color: var(--admin-accent); }
.metric-card:disabled { cursor: default; }
.metric-icon { display: grid; place-items: center; width: 43px; height: 43px; flex-shrink: 0; border-radius: 12px; color: var(--admin-accent); background: var(--admin-bg); }
.metric-card.is-active .metric-icon { background: #d2e8d8; }
.metric-content { display: flex; flex-direction: column; gap: 2px; }
.metric-label { color: var(--admin-muted); font-size: 12px; }
.metric-content strong { font-size: 27px; line-height: 1.25; font-weight: 600; font-variant-numeric: tabular-nums; }
.metric-hint { margin-left: auto; align-self: flex-end; display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--admin-muted); white-space: nowrap; }
.page-alert { margin-bottom: 18px; }
.create-panel { padding: 20px 22px; margin-bottom: 18px; border-color: var(--admin-accent); }
.create-heading { display: flex; gap: 12px; align-items: center; margin-bottom: 16px; }
.create-heading h2 { font-size: 15px; margin: 0; }
.create-heading p { color: var(--admin-muted); font-size: 12px; margin: 3px 0 0; }
.create-icon { display: grid; place-items: center; width: 36px; height: 36px; background: var(--admin-accent-soft); color: var(--admin-accent); border-radius: 10px; }
.create-form { display: flex; align-items: flex-start; gap: 10px; }
.create-input-wrap { flex: 1; min-width: 0; }
.character-count { color: var(--admin-muted); font-size: 11px; font-variant-numeric: tabular-nums; }
.input-feedback { margin: 6px 0 0; font-size: 11px; color: var(--admin-muted); line-height: 1.5; overflow-wrap: anywhere; }
.input-feedback.is-error { color: #b3384e; }
.workspace-panel { overflow: hidden; }
.workspace-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 22px 22px 0; }
.workspace-title { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.workspace-title h2 { margin: 0; font-size: 16px; font-weight: 600; }
.result-count { color: var(--admin-accent); font-size: 11px; background: var(--admin-accent-soft); padding: 2px 8px; border-radius: 6px; }
.workspace-hint { font-size: 11px; color: var(--admin-muted); }
.workspace-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; padding: 18px 22px; }
.tag-search { flex: 1; min-width: 180px; }
.sort-control { display: flex; align-items: center; gap: 10px; }
.sort-control > span { color: var(--admin-muted); font-size: 12px; }
.sort-select { width: 185px; }
.selection-toolbar { display: flex; align-items: center; gap: 12px; min-height: 49px; padding: 9px 22px; border-block: 1px solid var(--admin-border); background: #fafcf9; font-size: 12px; flex-wrap: wrap; }
.selection-toolbar.has-selection { background: var(--admin-accent-soft); }
.selection-summary { color: var(--admin-accent); }
.selection-summary strong { font-variant-numeric: tabular-nums; }
.selection-summary > span, .selection-hint { font-size: 11px; color: var(--admin-muted); }
.batch-delete { margin-left: auto; }
.tag-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; padding: 22px; transition: opacity .15s; }
.tag-grid.is-loading { opacity: .55; }
.tag-card { display: flex; flex-direction: column; justify-content: space-between; min-width: 0; min-height: 112px; padding: 16px 15px 11px; border: 1px solid var(--admin-border); border-radius: 10px; background: var(--admin-surface); transition: background .15s, border-color .15s, box-shadow .15s; }
.tag-card:hover { border-color: #9dbda7; box-shadow: 0 3px 12px #294b3610; }
.tag-card.is-selected { border-color: var(--admin-accent); background: #f0f8f1; }
.tag-card.is-editing, .tag-card.is-recent { border-color: var(--admin-accent); box-shadow: 0 0 0 2px var(--admin-accent-soft); }
.tag-card-main { display: flex; align-items: flex-start; gap: 11px; }
.tag-card-main > .n-checkbox { margin-top: 4px; flex-shrink: 0; }
.tag-name { border: 0; padding: 0; text-align: left; background: transparent; color: var(--admin-text); font-weight: 500; font-size: 14px; line-height: 1.65; min-width: 0; overflow-wrap: anywhere; }
.tag-name:hover:not(:disabled) { color: var(--admin-accent); }
.tag-name:disabled { cursor: default; }
.tag-hash { color: #83a08c; margin-right: 5px; }
.tag-card-footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 16px 0 0 27px; }
.usage-label { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--admin-muted); }
.usage-dot { display: inline-block; width: 5px; height: 5px; background: var(--admin-accent); border-radius: 50%; flex-shrink: 0; }
.is-unused .usage-dot { background: #a3aea5; }
.tag-delete { color: var(--admin-muted); }
.tag-delete:hover { color: #b3384e; }
.rename-form { width: 100%; }
.rename-label { display: block; font-size: 11px; color: var(--admin-accent); margin-bottom: 7px; }
.rename-actions { display: flex; justify-content: flex-end; gap: 7px; margin-top: 10px; }
.empty-state { padding: 54px 20px; text-align: center; }
.empty-icon { display: inline-grid; place-items: center; width: 66px; height: 66px; border-radius: 20px; color: var(--admin-accent); background: var(--admin-accent-soft); }
.empty-state h3 { font-size: 16px; margin: 18px 0 8px; }
.empty-state p { color: var(--admin-muted); font-size: 12px; margin: 0 0 20px; }
.workspace-footer { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 16px 22px; border-top: 1px solid var(--admin-border); flex-wrap: wrap; }
.range-label { color: var(--admin-muted); font-size: 11px; }
.page-footnote { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; color: var(--admin-muted); font-size: 11px; line-height: 1.8; margin: 15px 3px 0; }
.page-footnote > .n-icon { flex-shrink: 0; }
.delete-summary { font-size: 13px; line-height: 1.8; }
.delete-tag-list { display: flex; flex-wrap: wrap; gap: 8px; max-height: 180px; overflow-y: auto; padding: 2px; }
.delete-tag-list :deep(.n-tag) { max-width: 100%; height: auto; min-height: 28px; }
.delete-tag-list :deep(.n-tag__content) { white-space: normal; overflow-wrap: anywhere; }
.delete-note, .delete-progress { color: var(--admin-muted); font-size: 12px; margin: 14px 0 0; }
.delete-actions { display: flex; justify-content: flex-end; gap: 10px; }
@media (max-width: 1100px) { .metric-hint { display: none; } .workspace-hint { max-width: 230px; text-align: right; } }
@media (max-width: 640px) {
  .tag-overview { gap: 8px; margin-bottom: 18px; }
  .metric-card { padding: 14px 12px; gap: 8px; }
  .metric-icon { display: none; }
  .metric-content strong { font-size: 23px; }
  .metric-label { font-size: 11px; }
  .workspace-heading { align-items: flex-start; flex-direction: column; padding: 18px 16px 0; gap: 6px; }
  .workspace-hint { text-align: left; max-width: none; }
  .workspace-toolbar { padding: 15px 16px; gap: 10px; }
  .tag-search { flex-basis: 100%; }
  .sort-control { flex: 1; }
  .sort-select { width: auto; flex: 1; min-width: 145px; }
  .selection-toolbar { padding: 10px 16px; gap: 9px; }
  .selection-hint { display: none; }
  .selection-summary > span { display: block; }
  .tag-grid { grid-template-columns: repeat(auto-fill, minmax(185px, 1fr)); padding: 16px; gap: 10px; }
  .workspace-footer { padding: 16px; }
  .workspace-footer :deep(.n-pagination) { flex-wrap: wrap; row-gap: 8px; }
  .create-panel { padding: 16px; }
  .create-form { flex-wrap: wrap; }
  .create-input-wrap { flex-basis: 100%; }
  .page-footnote { align-items: flex-start; display: block; }
  .page-footnote > .n-icon { vertical-align: -3px; margin-right: 4px; }
}
</style>
