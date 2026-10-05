<script setup lang="ts">
import { computed, h, onMounted, onBeforeUnmount, ref } from 'vue'
import { NAlert, NButton, NDataTable, NInput, NSpace, NTag, useMessage, type DataTableColumns } from 'naive-ui'
import { fetchDerivativeStatus, enqueueDerivatives, retryDerivative, rollbackDerivative, type DerivativeJob } from '../api/derivatives'

const jobs = ref<DerivativeJob[]>([])
const loading = ref(false)
const submitting = ref(false)
const error = ref('')
const keyword = ref('')
const message = useMessage()
let disposed = false
let timer: ReturnType<typeof setTimeout> | undefined
const failed = (row: DerivativeJob) => /failed|error|cancelled/i.test(row.status)
// An enqueued job is not a completed migration: activation must also be recorded.
const complete = (row: DerivativeJob) => !!row.packageId && row.activePackageId === row.packageId && /done|completed|active|succeeded/i.test(row.status)
const counts = computed(() => ({ complete: jobs.value.filter(complete).length, failed: jobs.value.filter(failed).length, total: jobs.value.length }))
const filtered = computed(() => jobs.value.filter(j => `${j.fileName} ${j.hash} ${j.status}`.toLowerCase().includes(keyword.value.toLowerCase())))
async function refresh() {
  if (loading.value || disposed) return
  loading.value = true
  try {
    const result = await fetchDerivativeStatus()
    if (!disposed) { jobs.value = result; error.value = '' }
  } catch (e: unknown) {
    if (!disposed) error.value = `迁移状态读取失败：${e instanceof Error ? e.message : '请稍后刷新'}`
  } finally {
    loading.value = false
    clearTimeout(timer)
    if (!disposed) timer = setTimeout(refresh, 10000)
  }
}
async function run(action: () => Promise<unknown>, success: string) {
  if (submitting.value) return
  submitting.value = true
  try { await action(); message.success(success); await refresh() }
  catch (e: unknown) { message.error(e instanceof Error ? e.message : '操作失败') }
  finally { submitting.value = false }
}
const columns: DataTableColumns<DerivativeJob> = [
  { title: '媒体', key: 'fileName', ellipsis: { tooltip: true }, minWidth: 160 },
  { title: '类型', key: 'mediaType', width: 65, render: row => row.mediaType === 'video' ? '视频' : '图片' },
  { title: '状态', key: 'status', width: 100, render: row => h(NTag, { type: complete(row) ? 'success' : failed(row) ? 'error' : 'info', size: 'small' }, { default: () => complete(row) ? '已验证并启用' : row.status }) },
  { title: '配置版本', key: 'recipeVersion', width: 150 },
  { title: '结果说明', key: 'error', minWidth: 200, ellipsis: { tooltip: true }, render: row => row.error || row.diagnostics || '—' },
  { title: '操作', key: 'actions', width: 165, render: row => h(NSpace, { size: 6 }, { default: () => [
    failed(row) ? h(NButton, { size: 'tiny', disabled: submitting.value, onClick: () => run(() => retryDerivative(row.jobId), '任务已重新排队') }, { default: () => '重试' }) : null,
    complete(row) ? h(NButton, { size: 'tiny', disabled: submitting.value, onClick: () => run(() => rollbackDerivative(row.assetId), '已恢复上一可用版本') }, { default: () => '回退版本' }) : null
  ] }) }
]
onMounted(refresh)
onBeforeUnmount(() => { disposed = true; clearTimeout(timer) })
</script>

<template>
  <section class="derivative-migration" aria-label="HLS 与高清缩略图迁移">
    <div class="migration-heading">
      <div><h3>HLS 与高清缩略图迁移</h3><p>已验证并启用 {{ counts.complete }} / {{ counts.total }} 项 · 失败 {{ counts.failed }} 项</p></div>
      <n-space><n-button :loading="loading" @click="refresh">刷新状态</n-button>
        <n-button type="primary" :loading="submitting" @click="run(() => enqueueDerivatives(), '已加入迁移队列；全部验证通过后才会启用')">迁移下一批（最多 100 项）</n-button></n-space>
    </div>
    <n-alert v-if="error" type="error">{{ error }}</n-alert>
    <p class="migration-help">重新生成播放与预览文件，保留原件、封面选择和已有分析结果。失败项可重试；启用后可回退上一可用版本。</p>
    <n-input v-model:value="keyword" clearable placeholder="搜索文件名、标识或状态" aria-label="搜索迁移任务" />
    <n-data-table :columns="columns" :data="filtered" :loading="loading" :row-key="row => row.jobId" :pagination="{ pageSize: 10 }" :scroll-x="850" size="small" />
  </section>
</template>

<style scoped>
.derivative-migration { padding: 20px; margin: 18px 0 28px; border: 1px solid var(--admin-border, #484848); }
.migration-heading { display: flex; gap: 16px; justify-content: space-between; flex-wrap: wrap; }
.migration-heading h3 { margin: 0; }
.migration-heading p, .migration-help { opacity: .75; font-size: 13px; }
.derivative-migration :deep(.n-data-table) { margin-top: 12px; }
</style>
