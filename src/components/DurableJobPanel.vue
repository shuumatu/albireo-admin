<template>
  <section class="durable-jobs">
    <div class="job-heading">
      <h3>持久任务记录 <n-tag size="small" :bordered="false">{{ jobs.length }}</n-tag></h3>
      <n-button size="small" :loading="loading" @click="load">刷新记录</n-button>
    </div>
    <p>文件处理、AI 分析与向量生成分别排队与重试，处理失败不影响已就绪媒体的浏览。显示最近 100 条任务。</p>
    <div class="job-filters"><n-input v-model:value="keyword" placeholder="搜索文件名、任务编号或错误" clearable aria-label="搜索持久任务" /><n-select v-model:value="statusFilter" :options="statusOptions" aria-label="筛选任务状态" /><span>{{ filteredJobs.length }} 条记录</span></div>
    <n-alert v-if="error" type="error" :show-icon="false">{{ error }}</n-alert>
    <n-empty v-else-if="!loading && filteredJobs.length === 0" :description="jobs.length ? '没有符合筛选条件的任务' : '暂无持久任务记录'" />
    <div class="table-scroll"><n-table v-if="filteredJobs.length" size="small" :single-line="false">
      <thead><tr><th>媒体</th><th>状态</th><th>执行次数</th><th>说明</th><th>操作</th></tr></thead>
      <tbody>
        <tr v-for="job in filteredJobs" :key="job.id">
          <td>{{ job.fileName }}<small>{{ job.stage === 'render' ? '文件处理' : job.stage === 'embedding' ? '向量生成' : 'AI 分析' }} · 第 {{ job.generation }} 次任务 · #{{ job.id }}</small></td>
          <td><n-tag size="small" :bordered="false" :type="job.status === 'failed' ? 'error' : job.status === 'succeeded' ? 'success' : job.status === 'running' ? 'info' : 'default'">{{ states[job.status] || job.status }}</n-tag><small>{{ job.mediaStatus === 'done' ? '媒体已就绪' : '媒体尚未就绪' }}</small></td>
          <td>{{ job.attemptCount }} / {{ job.maxAttempts }}</td>
          <td>{{ job.error || '—' }}<small v-if="job.status === 'pending'">下次尝试：{{ new Date(job.availableAt).toLocaleString() }}</small></td>
          <td><n-button v-if="['analysis', 'render', 'embedding'].includes(job.stage) && job.status === 'failed'" size="small" type="primary" secondary :disabled="retrying !== null && retrying !== job.id" :loading="retrying === job.id" @click="retry(job.id)">重新执行</n-button></td>
        </tr>
      </tbody>
    </n-table></div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useMessage } from 'naive-ui'
import request from '../utils/request'
interface Job {
  id: number; stage: string; generation: number; status: string; attemptCount: number; maxAttempts: number
  availableAt: string; error: string | null; fileName: string; mediaStatus: string | null
}
const jobs = ref<Job[]>([])
const props = withDefaults(defineProps<{ autoRefresh?: boolean }>(), { autoRefresh: true })
const message = useMessage()
const keyword = ref('')
const statusFilter = ref('all')
const statusOptions = [{ label: '全部状态', value: 'all' }, { label: '需要处理', value: 'failed' }, { label: '执行中', value: 'running' }, { label: '等待执行', value: 'pending' }, { label: '已完成', value: 'succeeded' }, { label: '已取消', value: 'cancelled' }]
const filteredJobs = computed(() => jobs.value.filter(job => (statusFilter.value === 'all' || statusFilter.value === job.status) && (job.fileName + ' ' + job.id + ' ' + (job.error || '')).toLowerCase().includes(keyword.value.trim().toLowerCase())))
let disposed = false
const loading = ref(false)
const error = ref('')
const retrying = ref<number | null>(null)
const states: Record<string, string> = { pending: '等待执行', running: '执行中', succeeded: '已完成', failed: '需要处理', cancelled: '已取消' }
let timer: ReturnType<typeof setInterval> | undefined
async function load() {
  if (loading.value || disposed) return
  loading.value = true
  try {
    const response = await request.get<unknown, { code: number; data: Job[] }>('/task/jobs')
    if (disposed) return
    if (response.code !== 200 || !Array.isArray(response.data)) throw new Error('Invalid task response')
    jobs.value = response.data; error.value = ''
  }
  catch { error.value = '任务记录读取失败，请稍后刷新。' }
  finally { loading.value = false }
}
async function retry(id: number) {
  if (retrying.value !== null) return
  retrying.value = id
  try { await request.post(`/task/jobs/${id}/retry`); message.success('任务已重新入队'); await load() }
  catch { error.value = '重试提交失败，请检查服务状态。' }
  finally { retrying.value = null }
}
onMounted(() => { void load(); timer = setInterval(() => { if (props.autoRefresh && !document.hidden) void load() }, 10000) })
onUnmounted(() => { disposed = true; if (timer) clearInterval(timer) })
</script>

<style scoped>
.durable-jobs { padding: 4px 0; min-width: 0; }.table-scroll { overflow-x: auto; }.table-scroll .n-table { min-width: 740px; }.table-scroll td { max-width: 340px; overflow-wrap: anywhere; }.table-scroll td:last-child { min-width: 100px; }
.job-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }.job-heading h3 { margin: 0; font-size: 16px; }.job-filters { display: flex; gap: 10px; align-items: center; margin: 18px 0; }.job-filters .n-input { max-width: 340px; }.job-filters .n-select { width: 160px; }.job-filters span { font-size: 12px; color: var(--n-text-color-3); white-space: nowrap; }
@media(max-width:600px) { .job-filters { flex-wrap: wrap; }.job-filters .n-input { max-width: none; } }
small { display: block; margin-top: 4px; opacity: .7; }
p { color: #737373; font-size: 13px; }
</style>
