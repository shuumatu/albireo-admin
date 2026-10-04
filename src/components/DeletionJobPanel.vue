<template>
  <section class="deletion-jobs">
    <div class="heading"><h3>文件清理</h3><n-button size="small" :loading="loading" @click="load">刷新</n-button></div>
    <p>媒体删除后，文件清理会延迟执行。被其他内容引用或无法核实身份的历史文件将保留待核对。</p>
    <n-alert v-if="error" type="error">{{ error }}</n-alert>
    <n-empty v-if="!loading && !error && !rows.length" description="暂无文件清理记录" />
    <div class="table-scroll"><n-table v-if="rows.length" size="small">
      <thead><tr><th>资产</th><th>状态</th><th>已清理 / 等待</th><th>仍被引用 / 待核实</th><th>说明</th></tr></thead>
      <tbody><tr v-for="row in rows" :key="row.id">
        <td>#{{ row.assetId }}</td><td><n-tag :type="row.status === 'completed' ? 'success' : 'warning'" size="small" :bordered="false">{{ row.status === 'completed' ? '清理完成' : '处理中或待核对' }}</n-tag></td>
        <td>{{ row.cleaned }} / {{ row.pending }}</td><td>{{ row.referenced }} / {{ row.unverified }}</td><td>{{ row.error || '—' }}</td>
      </tr></tbody>
    </n-table></div>
  </section>
</template>
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import request from '../utils/request'
interface Row { id: string; assetId: number; status: string; cleaned: number; pending: number; referenced: number; unverified: number; error: string | null }
const rows=ref<Row[]>([]), loading=ref(false), error=ref('')
const props = withDefaults(defineProps<{ autoRefresh?: boolean }>(), { autoRefresh: true })
let disposed = false
let timer: ReturnType<typeof setInterval> | undefined
async function load() {
  if(loading.value || disposed) return
  loading.value=true
  try { const result=await request.get<unknown,{code:number;data:Row[]}>('/task/deletions'); if(result.code!==200 || !Array.isArray(result.data)) throw new Error(); rows.value=result.data;error.value='' }
  catch { error.value='文件清理记录读取失败，请稍后刷新。' }
  finally { loading.value=false }
}
onMounted(()=>{void load();timer=setInterval(() => { if (props.autoRefresh && !document.hidden) void load() },15000)})
onUnmounted(()=>{disposed=true;if(timer)clearInterval(timer)})
</script>
<style scoped>
.deletion-jobs {padding:4px 0;min-width:0}.heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.heading h3{margin:0;font-size:16px}p{color:var(--n-text-color-3);font-size:13px}.table-scroll{overflow-x:auto}.table-scroll .n-table{min-width:640px}.table-scroll td{max-width:320px;overflow-wrap:anywhere}
</style>
