<template>
  <section class="deletion-jobs">
    <div class="heading"><h3>文件清理</h3><n-button size="small" :loading="loading" @click="load">刷新</n-button></div>
    <p>媒体删除后，文件清理会延迟执行。被其他内容引用或无法核实身份的历史文件将保留待核对。</p>
    <n-alert v-if="error" type="error">{{ error }}</n-alert>
    <n-empty v-if="!loading && !rows.length" description="暂无文件清理记录" />
    <n-table v-if="rows.length" size="small">
      <thead><tr><th>资产</th><th>状态</th><th>已清理 / 等待</th><th>仍被引用 / 待核实</th><th>说明</th></tr></thead>
      <tbody><tr v-for="row in rows" :key="row.id">
        <td>#{{ row.assetId }}</td><td>{{ row.status === 'completed' ? '清理完成' : '处理中或待核对' }}</td>
        <td>{{ row.cleaned }} / {{ row.pending }}</td><td>{{ row.referenced }} / {{ row.unverified }}</td><td>{{ row.error || '—' }}</td>
      </tr></tbody>
    </n-table>
  </section>
</template>
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import request from '../utils/request'
interface Row { id: string; assetId: number; status: string; cleaned: number; pending: number; referenced: number; unverified: number; error: string | null }
const rows=ref<Row[]>([]), loading=ref(false), error=ref('')
let timer: ReturnType<typeof setInterval> | undefined
async function load() {
  if(loading.value) return
  loading.value=true
  try { const result=await request.get<unknown,{code:number;data:Row[]}>('/task/deletions'); if(result.code!==200 || !Array.isArray(result.data)) throw new Error(); rows.value=result.data;error.value='' }
  catch { error.value='文件清理记录读取失败，请稍后刷新。' }
  finally { loading.value=false }
}
onMounted(()=>{void load();timer=setInterval(load,15000)})
onUnmounted(()=>{if(timer)clearInterval(timer)})
</script>
<style scoped>
.deletion-jobs {margin:24px 0;overflow-x:auto}.heading{display:flex;align-items:center;justify-content:space-between}p{color:#737373;font-size:13px}
</style>
