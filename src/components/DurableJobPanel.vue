<template>
  <section class="durable-jobs">
    <div class="job-heading">
      <h3>持久任务记录</h3>
      <n-button size="small" :loading="loading" @click="load">刷新记录</n-button>
    </div>
    <p>文件处理、AI 分析与向量生成分别排队与重试，处理失败不影响已就绪媒体的浏览。显示最近 100 条任务。</p>
    <n-alert v-if="error" type="error" :show-icon="false">{{ error }}</n-alert>
    <n-empty v-else-if="!loading && jobs.length === 0" description="暂无持久任务记录" />
    <n-table v-if="jobs.length" size="small" :single-line="false">
      <thead><tr><th>媒体</th><th>状态</th><th>执行次数</th><th>说明</th><th>操作</th></tr></thead>
      <tbody>
        <tr v-for="job in jobs" :key="job.id">
          <td>{{ job.fileName }}<small>{{ job.stage === 'render' ? '文件处理' : job.stage === 'embedding' ? '向量生成' : 'AI 分析' }} · 第 {{ job.generation }} 次任务 · #{{ job.id }}</small></td>
          <td>{{ states[job.status] || job.status }}<small>{{ job.mediaStatus === 'done' ? '媒体已就绪' : '媒体尚未就绪' }}</small></td>
          <td>{{ job.attemptCount }} / {{ job.maxAttempts }}</td>
          <td>{{ job.error || '—' }}<small v-if="job.status === 'pending'">下次尝试：{{ new Date(job.availableAt).toLocaleString() }}</small></td>
          <td><n-button v-if="['analysis', 'render', 'embedding'].includes(job.stage) && job.status === 'failed'" size="tiny" :loading="retrying === job.id" @click="retry(job.id)">重新执行</n-button></td>
        </tr>
      </tbody>
    </n-table>
  </section>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import request from '../utils/request'
interface Job {
  id: number; stage: string; generation: number; status: string; attemptCount: number; maxAttempts: number
  availableAt: string; error: string | null; fileName: string; mediaStatus: string | null
}
const jobs = ref<Job[]>([])
const loading = ref(false)
const error = ref('')
const retrying = ref<number | null>(null)
const states: Record<string, string> = { pending: '等待执行', running: '执行中', succeeded: '已完成', failed: '需要处理', cancelled: '已取消' }
let timer: ReturnType<typeof setInterval> | undefined
async function load() {
  if (loading.value) return
  loading.value = true
  try {
    const response = await request.get<unknown, { code: number; data: Job[] }>('/task/jobs')
    if (response.code !== 200 || !Array.isArray(response.data)) throw new Error('Invalid task response')
    jobs.value = response.data; error.value = ''
  }
  catch { error.value = '任务记录读取失败，请稍后刷新。' }
  finally { loading.value = false }
}
async function retry(id: number) {
  retrying.value = id
  try { await request.post(`/task/jobs/${id}/retry`); await load() }
  catch { error.value = '重试提交失败，请检查服务状态。' }
  finally { retrying.value = null }
}
onMounted(() => { void load(); timer = setInterval(load, 10000) })
onUnmounted(() => { if (timer) clearInterval(timer) })
</script>

<style scoped>
.durable-jobs { margin: 24px 0; overflow-x: auto; }
.job-heading { display: flex; align-items: center; justify-content: space-between; }
small { display: block; margin-top: 4px; opacity: .7; }
p { color: #737373; font-size: 13px; }
</style>
