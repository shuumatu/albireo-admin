<template>
  <section class="admin-page tag-page">
    <header class="admin-page-header">
      <div><h1>标签管理</h1><p>整理媒体标签，让内容更容易查找与归类。</p></div>
      <n-button type="primary" @click="openEditor()">新建标签</n-button>
    </header>
    <div class="admin-panel">
      <div class="admin-toolbar tag-toolbar">
        <n-input v-model:value="searchKeyword" placeholder="搜索标签名称" clearable aria-label="搜索标签名称" class="tag-search" @keyup.enter="handleSearch" @clear="handleSearch" />
        <n-button type="primary" secondary :loading="loading" @click="handleSearch">搜索</n-button>
        <n-button v-if="appliedKeyword" @click="resetSearch">重置</n-button>
        <n-button :disabled="loading" @click="fetchTags">刷新</n-button>
        <n-text depth="3" class="tag-count" aria-live="polite">{{ appliedKeyword ? '搜索结果' : '全部标签' }} · {{ total }} 个</n-text>
      </div>
      <n-alert v-if="loadError" type="error" :bordered="false" class="load-error">
        {{ loadError }} <n-button text type="error" @click="fetchTags">重新加载</n-button>
      </n-alert>
      <n-data-table :columns="columns" :data="tagList" :loading="loading" :pagination="false" :row-key="(row: TagItem) => row.id" :scroll-x="540" :bordered="false">
        <template #empty><n-empty :description="loadError ? '列表暂时不可用，请重新加载' : appliedKeyword ? '没有找到匹配的标签' : '还没有标签，创建一个开始整理内容'" /></template>
      </n-data-table>
      <div class="admin-pagination" v-if="total > 0">
        <n-pagination v-model:page="page" :page-size="pageSize" :item-count="total" :page-sizes="[10, 20, 50, 100]" show-size-picker :page-slot="5" @update:page-size="changePageSize" />
      </div>
    </div>
  </section>
  <n-modal v-model:show="showModal" :title="isEdit ? '编辑标签' : '新建标签'" preset="card" style="width: min(440px, calc(100vw - 32px));" :mask-closable="!submitting" :closable="!submitting" :close-on-esc="!submitting" @after-leave="formRef?.restoreValidation()">
    <n-form ref="formRef" :model="form" :rules="rules" label-placement="top" :disabled="submitting" @submit.prevent="handleSubmit">
      <n-form-item label="标签名称" path="name"><n-input v-model:value="form.name" placeholder="输入简短、易识别的标签名称" autofocus @keyup.enter="handleSubmit" /></n-form-item>
    </n-form>
    <template #action><n-space justify="end"><n-button :disabled="submitting" @click="showModal = false">取消</n-button><n-button type="primary" :loading="submitting" @click="handleSubmit">{{ isEdit ? '保存修改' : '创建标签' }}</n-button></n-space></template>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, reactive, h, computed, onMounted } from 'vue'
import { NButton, NPopconfirm, NTag, useMessage, type FormInst, type DataTableColumns } from 'naive-ui'
import { fetchTags as apiFetchTags, createTag, updateTag, deleteTag } from '../api/tags'

interface TagItem { id: number; name: string; usageCount?: number }
const message = useMessage()
const allTags = ref<TagItem[]>([])
const loading = ref(false)
const loadError = ref('')
const submitting = ref(false)
const deletingIds = ref(new Set<number>())
const showModal = ref(false)
const isEdit = ref(false)
const searchKeyword = ref('')
const appliedKeyword = ref('')
const formRef = ref<FormInst | null>(null)
const page = ref(1)
const pageSize = ref(20)
let requestId = 0
const total = computed(() => allTags.value.length)
const tagList = computed(() => allTags.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
const form = reactive({ id: 0, name: '' })
const rules = { name: [{ required: true, validator: (_rule: unknown, value: string) => !!value?.trim(), message: '请输入标签名称', trigger: ['input', 'blur'] }] }
const columns = computed<DataTableColumns<TagItem>>(() => [
  { title: '标签名称', key: 'name', render: row => h(NTag, { type: 'info', bordered: false }, { default: () => row.name }) },
  { title: '使用次数', key: 'usageCount', width: 120, render: row => row.usageCount ?? 0 },
  { title: '操作', key: 'actions', width: 160, render: row => h('div', { style: 'display:flex;gap:8px' }, [
    h(NButton, { size: 'small', disabled: deletingIds.value.has(row.id), onClick: () => openEditor(row) }, { default: () => '编辑' }),
    h(NPopconfirm, { onPositiveClick: () => handleDelete(row.id), positiveText: '删除标签', negativeText: '取消' }, {
      default: () => `确定删除标签「${row.name}」吗？相关媒体上的此标签也会移除。`,
      trigger: () => h(NButton, { size: 'small', type: 'error', secondary: true, loading: deletingIds.value.has(row.id) }, { default: () => '删除' })
    })
  ]) }
])
async function fetchTags() {
  const current = ++requestId
  loading.value = true
  loadError.value = ''
  try {
    const res = await apiFetchTags({ keyword: appliedKeyword.value })
    if (current !== requestId) return
    allTags.value = Array.isArray(res) ? res : ((res as any).list ?? (res as any).records ?? [])
    page.value = Math.min(page.value, Math.max(1, Math.ceil(total.value / pageSize.value)))
  } catch {
    if (current === requestId) { allTags.value = []; loadError.value = '标签加载失败，请检查网络后重试。' }
  } finally { if (current === requestId) loading.value = false }
}
function handleSearch() { appliedKeyword.value = searchKeyword.value.trim(); page.value = 1; void fetchTags() }
function resetSearch() { searchKeyword.value = ''; handleSearch() }
function changePageSize(size: number) { pageSize.value = size; page.value = 1 }
function openEditor(row?: TagItem) {
  isEdit.value = !!row
  Object.assign(form, { id: row?.id ?? 0, name: row?.name ?? '' })
  showModal.value = true
}
async function handleSubmit() {
  if (submitting.value) return
  submitting.value = true
  try { await formRef.value?.validate() } catch { submitting.value = false; return }
  try {
    const payload = { name: form.name.trim() }
    if (isEdit.value) await updateTag(form.id, payload)
    else await createTag(payload)
    message.success(isEdit.value ? '标签已更新' : '标签已创建')
    showModal.value = false
    await fetchTags()
  } catch { message.error('保存失败，请重试') }
  finally { submitting.value = false }
}
async function handleDelete(id: number) {
  if (deletingIds.value.has(id)) return false
  deletingIds.value.add(id)
  try { await deleteTag(id); message.success('标签已删除'); await fetchTags() }
  catch { message.error('删除失败，请重试'); return false }
  finally { deletingIds.value.delete(id) }
}
onMounted(fetchTags)
</script>

<style scoped>
.tag-toolbar { gap: 10px; flex-wrap: wrap; }
.tag-search { width: min(300px, 100%); }
.tag-count { margin-left: auto; }
.load-error { margin-bottom: 16px; }
@media (max-width: 640px) { .tag-search { width: 100%; } .tag-count { width: 100%; margin-left: 0; } }
</style>
