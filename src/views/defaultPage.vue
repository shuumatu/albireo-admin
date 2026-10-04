<template>
  <div class="dashboard admin-page">
    <header class="admin-page-header">
      <div><div class="eyebrow">WORKSPACE OVERVIEW</div><h1>工作台</h1><p>欢迎回来，{{ auth.username || '管理员' }}。从这里开始整理你的创作。</p></div>
      <div class="dashboard-actions"><span class="today">{{ today }}</span><n-button :loading="loading" @click="loadOverview"><template #icon><n-icon :component="RefreshOutline" /></template>刷新概览</n-button></div>
    </header>
    <section class="welcome-banner">
      <div><span class="banner-label">每一份灵感，都值得被珍藏</span><h2>让内容井然有序，让创作持续发生。</h2><p>上传、整理与分享，在一个工作空间中完成。</p><n-button color="#ffffff" text-color="#2f7b5b" @click="router.push('/upload')"><template #icon><n-icon :component="AddOutline" /></template>上传新素材</n-button></div>
      <div class="banner-art" aria-hidden="true"><div class="orbit orbit-one" /><div class="orbit orbit-two" /><div class="fox-tile"><img :src="albireoLogo" alt="" /></div><span class="art-star star-one">✦</span><span class="art-star star-two">✦</span></div>
    </section>
    <n-alert v-if="failedSections.length" type="warning" :bordered="false" class="overview-alert">{{ failedSections.join('、') }}暂时无法加载，可点击「刷新概览」重试。</n-alert>
    <section class="overview-grid" aria-label="内容概览">
      <router-link v-for="stat in stats" :key="stat.label" :to="stat.path" class="stat-card admin-panel">
        <div class="stat-top"><span>{{ stat.label }}</span><span class="stat-icon" :style="{ color: stat.color, background: stat.background }"><n-icon :component="stat.icon" :size="20" /></span></div>
        <n-skeleton v-if="loading && stat.value === null" width="64px" height="35px" :sharp="false" /><strong v-else class="stat-value">{{ stat.value === null ? '—' : stat.value.toLocaleString() }}</strong>
        <div class="stat-bottom"><span>{{ stat.hint }}</span><n-icon :component="ArrowForwardOutline" :size="15" /></div>
      </router-link>
    </section>
    <div class="dashboard-grid">
      <section class="quick-panel admin-panel"><div class="section-heading"><h2>常用功能</h2><span>内容管理</span></div><div class="quick-grid"><router-link v-for="item in quickLinks" :key="item.path" :to="item.path" class="quick-link"><span class="quick-icon"><n-icon :component="item.icon" :size="22" /></span><span><strong>{{ item.label }}</strong><small>{{ item.description }}</small></span><n-icon class="quick-arrow" :component="ChevronForwardOutline" :size="15" /></router-link></div></section>
      <section class="activity-panel admin-panel"><div class="section-heading"><h2>处理动态</h2><router-link to="/manager/task-progress">查看全部 <n-icon :component="ArrowForwardOutline" /></router-link></div>
        <n-skeleton v-if="loading && !tasks.length" text :repeat="4" />
        <n-empty v-else-if="taskError" description="暂时无法获取任务状态"><template #extra><n-button size="small" @click="loadOverview">重新加载</n-button></template></n-empty>
        <div v-else-if="!tasks.length" class="quiet-state"><span class="quiet-icon"><n-icon :component="CheckmarkCircleOutline" :size="33" /></span><strong>当前没有处理中的任务</strong><p>上传素材后，可在这里查看处理动态。</p><router-link to="/upload">开始上传 <n-icon :component="ArrowForwardOutline" /></router-link></div>
        <router-link v-for="task in tasks.slice(0, 4)" v-else :key="task.hash" to="/manager/task-progress" class="task-preview"><span class="task-icon"><n-icon :component="task.type === 'image' ? ImagesOutline : VideocamOutline" :size="19" /></span><div><strong>{{ task.fileName }}</strong><small>{{ task.type === 'image' ? '图片处理' : '视频处理' }}</small></div><n-tag :type="task.status.includes('fail') ? 'error' : 'info'" size="small" :bordered="false">{{ taskLabels[task.status] || task.status }}</n-tag></router-link>
      </section>
    </div>
    <section class="workflow admin-panel"><span class="workflow-icon"><n-icon :component="SparklesOutline" :size="22" /></span><div><strong>从素材到分享，轻松完成每一步</strong><p>上传素材 → 完善信息与标签 → 整理合集 → 创建分享</p></div><router-link to="/manager/collection">整理合集 <n-icon :component="ArrowForwardOutline" /></router-link></section>
    <footer class="dashboard-footer"><span>ALBIREO · 内容管理工作空间</span><span>快速前往页面 <kbd>Ctrl / ⌘ K</kbd></span></footer>
  </div>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ImagesOutline, VideocamOutline, AlbumsOutline, PulseOutline, RefreshOutline, AddOutline, ArrowForwardOutline, ChevronForwardOutline, CheckmarkCircleOutline, SparklesOutline } from '@vicons/ionicons5'
const albireoLogo = `${import.meta.env.BASE_URL}albireo-favicon.svg`
import { useAuthStore } from '../stores/auth'
import { navigationGroups } from '../config/navigation'
import { fetchImages } from '../api/images'
import { fetchVideoList, fetchCollections, fetchImageCollections } from '../api/manager'
import { fetchProcessingTasks, type TaskProgressVO } from '../api/task'
const auth = useAuthStore(), router = useRouter()
const today = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())
const quickLinks = navigationGroups[1]!.items
const loading = ref(false), imageCount = ref<number | null>(null), videoCount = ref<number | null>(null), collectionCount = ref<number | null>(null), taskCount = ref<number | null>(null)
const tasks = ref<TaskProgressVO[]>([]), failedSections = ref<string[]>([]), taskError = ref(false)
let disposed = false
const taskLabels: Record<string, string> = { pending: '等待中', processing: '处理中', transcoding: '转码中', ai_analyzing: '分析中', done: '已完成', failed: '失败', process_failed: '处理失败', transcode_failed: '转码失败', ai_analyze_failed: '分析失败', uploading: '上传中' }
const stats = computed(() => [
  { label: '图片素材', value: imageCount.value, hint: '浏览图片库', path: '/manager/image', icon: ImagesOutline, color: '#357858', background: '#e6f3e9' },
  { label: '视频素材', value: videoCount.value, hint: '浏览视频库', path: '/manager/video', icon: VideocamOutline, color: '#578464', background: '#edf5e8' },
  { label: '内容合集', value: collectionCount.value, hint: '图片与视频合集', path: '/manager/collection', icon: AlbumsOutline, color: '#728448', background: '#f0f4e3' },
  { label: '处理任务', value: taskCount.value, hint: '查看进度与待处理项', path: '/manager/task-progress', icon: PulseOutline, color: '#3f846e', background: '#e7f4ed' },
])
function readTotal(result: any): number {
  const total = Number(result?.total)
  if (Number.isFinite(total) && total >= 0) return total
  if (Array.isArray(result)) return result.length
  throw new Error('缺少总数')
}
async function loadOverview() {
  if (loading.value) return
  loading.value = true
  const results = await Promise.allSettled([
    fetchImages({ page: 1, pageSize: 1 }).then(readTotal),
    fetchVideoList({ page: 1, pageSize: 1, collectionId: 0 }).then(readTotal),
    Promise.all([fetchCollections({ page: 1, pageSize: 1 }), fetchImageCollections({ page: 1, pageSize: 1 })]).then(items => items.reduce((sum, item) => sum + readTotal(item), 0)),
    fetchProcessingTasks(),
  ])
  if (disposed) return
  const counts = [imageCount, videoCount, collectionCount]
  failedSections.value = []
  results.slice(0, 3).forEach((result, index) => {
    if (result.status === 'fulfilled') counts[index]!.value = result.value as number
    else { counts[index]!.value = null; failedSections.value.push(['图片', '视频', '合集'][index]!) }
  })
  const taskResult = results[3]!
  taskError.value = taskResult.status === 'rejected'
  if (taskResult.status === 'fulfilled' && Array.isArray(taskResult.value)) { tasks.value = taskResult.value; taskCount.value = tasks.value.length }
  else { taskCount.value = null; failedSections.value.push('处理任务') }
  loading.value = false
}
onMounted(loadOverview)
onBeforeUnmount(() => { disposed = true })
</script>
<style scoped>
.dashboard { max-width: 1560px; }.eyebrow { font-size: 10px; letter-spacing: 1.8px; color: var(--admin-muted); font-weight: 600; margin-bottom: 7px; }.dashboard-actions { display: flex; gap: 16px; align-items: center; }.today { font-size: 12px; color: var(--admin-muted); }
.welcome-banner { display: flex; align-items: center; justify-content: space-between; position: relative; overflow: hidden; padding: 29px 34px; margin-bottom: 22px; background: linear-gradient(112deg,#e2f2dc,#c7e5be); border: 1px solid #d3e8cd; border-radius: 16px; color: #254c36; min-height: 208px; }.banner-label { font-size: 11px; letter-spacing: 1px; color: #46634e; }.welcome-banner h2 { font-size: 24px; line-height: 1.5; font-weight: 600; margin: 8px 0 6px; letter-spacing: -.5px; }.welcome-banner p { color: #46634e; font-size: 12px; margin: 0 0 20px; }.welcome-banner > div:first-child { position: relative; z-index: 1; }.banner-art { width: 210px; height: 170px; display: grid; place-items: center; position: relative; flex-shrink: 0; margin-right: 36px; }.fox-tile { display: grid; place-items: center; width: 104px; height: 104px; border: 1px solid #34332b; border-radius: 24px; background: #151515; transform: rotate(-8deg); box-shadow: 0 16px 40px #386d3720; animation: float-fox 6s ease-in-out infinite; }.fox-tile img { width: 100%; height: 100%; object-fit: contain;  }.orbit { position: absolute; width: 186px; height: 186px; border: 1px solid #7cab6840; border-radius: 50%; }.orbit-two { width: 264px; height: 264px; }.art-star { position: absolute; color: #658e57; font-size: 21px; }.star-one { top: 10px; right: 20px; }.star-two { bottom: 6px; left: 5px; font-size: 13px; opacity: .65; }@keyframes float-fox { 0%,100% { transform: translateY(0) rotate(-8deg); }50% { transform: translateY(-7px) rotate(-5deg); } }
.overview-alert { margin-bottom: 18px; }.overview-grid { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 16px; margin-bottom: 24px; }.stat-card { padding: 19px 21px; transition: transform .2s ease, box-shadow .2s ease; }.stat-card:hover { transform: translateY(-3px); box-shadow: 0 8px 24px #284d3210; }.stat-top, .stat-bottom { display: flex; justify-content: space-between; align-items: center; gap: 5px; }.stat-top { color: #6b806e; font-size: 12px; }.stat-icon { width: 35px; height: 35px; display: grid; place-items: center; border-radius: 10px; }.stat-value { display: block; font-size: 30px; line-height: 1.4; font-weight: 600; letter-spacing: -.5px; margin: 7px 0 10px; font-variant-numeric: tabular-nums; }.stat-bottom { color: var(--admin-muted); font-size: 11px; }
.dashboard-grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 22px; }.quick-panel,.activity-panel { padding: 22px; min-width: 0; }.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 18px; }.section-heading h2 { font-size: 15px; margin: 0; font-weight: 600; }.section-heading > span { color: var(--admin-muted); font-size: 11px; }.section-heading a { display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--admin-accent); }.quick-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 8px 12px; }.quick-link { display: flex; align-items: center; gap: 12px; min-width: 0; padding: 15px 10px; border-radius: 10px; transition: background .18s ease; }.quick-link:hover { background: var(--admin-hover); }.quick-icon { background: var(--admin-accent-soft); color: var(--admin-icon); border-radius: 10px; width: 40px; height: 40px; flex-shrink: 0; display: grid; place-items: center; }.quick-link strong,.quick-link small { display: block; }.quick-link strong { font-size: 12px; font-weight: 600; }.quick-link small { font-size: 10px; color: var(--admin-muted); margin-top: 4px; }.quick-arrow { color: #a1b8a5; margin-left: auto; flex-shrink: 0; }.quiet-state { padding: 24px 0 16px; text-align: center; }.quiet-icon { width: 63px; height: 63px; border-radius: 50%; background: #edf6e9; color: #76a97a; display: grid; place-items: center; margin: 0 auto 17px; }.quiet-state strong { font-size: 13px; font-weight: 500; }.quiet-state p { color: var(--admin-muted); font-size: 11px; margin: 8px 0 20px; }.quiet-state a { color: var(--admin-accent); font-size: 12px; }.task-preview { display: flex; gap: 11px; align-items: center; padding: 14px 0; border-bottom: 1px solid var(--admin-border); }.task-icon { color: var(--admin-icon); }.task-preview > div { min-width: 0; flex: 1; }.task-preview strong { font-size: 12px; font-weight: 500; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.task-preview small { display: block; color: var(--admin-muted); font-size: 10px; margin-top: 4px; }
.workflow { display: flex; align-items: center; gap: 17px; padding: 22px 25px; margin-top: 22px; }.workflow-icon { color: #6f935a; width: 39px; height: 39px; background: #edf4e4; border-radius: 11px; display: grid; place-items: center; flex-shrink: 0; }.workflow strong { font-size: 12px; font-weight: 500; }.workflow p { font-size: 11px; color: var(--admin-muted); margin: 5px 0 0; }.workflow a { display: flex; align-items: center; gap: 7px; color: var(--admin-accent); font-size: 12px; margin-left: auto; white-space: nowrap; }.dashboard-footer { margin: 26px 0 0; display: flex; justify-content: space-between; color: #829887; font-size: 10px; letter-spacing: .3px; }.dashboard-footer kbd { font: inherit; border: 1px solid var(--admin-border); padding: 2px 5px; border-radius: 4px; margin-left: 5px; }
@media(max-width:1200px) { .dashboard-grid { grid-template-columns: 1fr; }.banner-art { margin-right: 0; }.quick-grid { grid-template-columns: repeat(3,minmax(0,1fr)); }.quick-link small { display: none; } }
@media(max-width:768px) { .overview-grid { grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; }.welcome-banner { padding: 24px; }.welcome-banner h2 { font-size: 21px; max-width: 290px; }.banner-art { position: absolute; right: -80px; opacity: .18; }.dashboard-actions .today { display: none; }.quick-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }.quick-panel,.activity-panel { padding: 18px; }.quick-link { padding: 12px 0; gap: 8px; }.quick-arrow { display: none; }.workflow { padding: 18px; flex-wrap: wrap; }.workflow a { margin-left: 56px; }.dashboard-footer > span:last-child { display: none; }.stat-card { padding: 16px; } }
</style>
