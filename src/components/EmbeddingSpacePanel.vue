<template>
  <section class="spaces">
    <div class="heading"><h3>向量空间</h3><n-space><n-button size="small" type="primary" secondary :loading="busy" :disabled="loading" @click="register">登记当前模型</n-button><n-button size="small" :loading="loading" :disabled="busy" @click="load">刷新</n-button></n-space></div>
    <p>当前检索：{{ state?.active.spaceId ? `空间 #${state.active.spaceId}` : '关键词检索（尚未启用新空间）' }}。先登记模型并补齐向量，检查检索质量后再启用。模型、校准或采样改变后需要登记新空间。</p>
    <n-alert v-if="error" type="error" :show-icon="false">{{ error }}</n-alert>
    <n-alert v-if="notice" type="info" :show-icon="false">{{ notice }}</n-alert>
    <n-empty v-if="state && !state.spaces.length" description="暂无向量空间，先登记当前模型开始配置" />
    <div class="table-scroll"><n-table v-if="state && state.spaces.length" size="small">
      <thead><tr><th>空间</th><th>模型版本</th><th>当前文件已就绪</th><th>操作</th></tr></thead>
      <tbody><tr v-for="space in state.spaces" :key="space.id">
        <td>#{{ space.id }} <n-tag v-if="state.active.spaceId === space.id" size="small" type="success" :bordered="false">检索中</n-tag><small>{{ space.verification === 'verified' ? '版本已登记' : '历史版本未核实' }}</small></td>
        <td>{{ space.modelId || '历史向量' }}<small>{{ space.modelRevision }}</small></td><td>{{ space.ready }}</td>
        <td><n-space v-if="space.verification === 'verified'">
          <n-button size="tiny" :disabled="busy" @click="backfill(space.id)">补齐向量</n-button>
          <n-button size="tiny" :disabled="busy || state.active.spaceId === space.id" @click="activate(space.id)">启用检索</n-button>
        </n-space><span v-else>保留备查</span></td>
      </tr></tbody>
    </n-table></div>
    <n-button v-if="state?.active.spaceId" class="fallback-button" size="small" :disabled="busy || loading" @click="activate(null)">切回关键词检索</n-button>
  </section>
</template>
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import request from '../utils/request'
interface State { active: { spaceId: number | null; revision: number }; spaces: { id: number; verification: string; modelId: string | null; modelRevision: string | null; ready: number }[] }
const state = ref<State | null>(null)
const busy = ref(false), error = ref(''), notice = ref('')
const loading = ref(false)
async function load() {
  if (loading.value) return
  loading.value = true
  try {
    const result = await request.get<unknown, State>('/embedding/spaces')
    if (!result?.active || !Array.isArray(result.spaces)) throw new Error('Invalid space response')
    state.value = result
    error.value = ''
  } catch { error.value = '无法读取向量空间，请刷新重试。' }
  finally { loading.value = false }
}
async function perform(action: () => Promise<void>) { if (busy.value || loading.value) return; busy.value = true; error.value = ''; notice.value = ''; try { await action(); await load() } catch (e: any) { error.value = e?.response?.data?.message || e?.response?.data?.msg || e?.message || '操作未完成，请检查模型是否就绪、任务是否全部成功。' } finally { busy.value = false } }
async function register() { await perform(async () => { await request.post('/embedding/spaces/register-current'); notice.value = '已登记当前模型。已有向量会保留，新空间需要重新生成。' }) }
async function backfill(id: number) { await perform(async () => { const jobs = await request.post<unknown, number[]>(`/embedding/spaces/${id}/backfill?limit=200`); notice.value = `已登记 ${jobs.length} 条任务，可在任务中心查看。每次最多 200 条，再次补齐会跳过已登记的有效任务。` }) }
async function activate(id: number | null) { await perform(async () => { const accepted = await request.post<unknown, boolean>('/embedding/spaces/activate', { spaceId: id, expectedRevision: state.value?.active.revision }); if (!accepted) throw new Error('空间状态已改变，请刷新后重试'); notice.value = id ? '已切换检索空间。' : '已切回关键词检索。' }) }
onMounted(load)
</script>
<style scoped>
.spaces { background: var(--n-card-color); border: 1px solid var(--n-divider-color); border-radius: 14px; padding: 22px; margin-bottom: 20px; min-width: 0; }
.heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }.heading h3 { margin: 0; font-size: 16px; }.table-scroll { overflow-x: auto; }.table-scroll .n-table { min-width: 620px; }.fallback-button { margin-top: 16px; }.n-alert { margin-bottom: 12px; }
small { display: block; color: #777; overflow-wrap: anywhere; max-width: 500px; }
p { color: #666; font-size: 13px; line-height: 1.6; }
</style>
