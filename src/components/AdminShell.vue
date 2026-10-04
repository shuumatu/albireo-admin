<template>
  <div class="admin-shell" :class="{ 'is-collapsed': collapsed }">
    <a class="skip-link" href="#main-content">跳转到主要内容</a>
    <Transition name="fade"><button v-if="mobileOpen" class="sidebar-scrim" aria-label="关闭导航" @click="mobileOpen = false" /></Transition>
    <aside ref="sidebar" class="sidebar" :class="{ 'is-open': mobileOpen }" aria-label="管理导航" :role="isMobile ? 'dialog' : undefined" :aria-modal="isMobile && mobileOpen ? true : undefined" :inert="isMobile && !mobileOpen">
      <router-link to="/" class="brand" aria-label="Albireo 工作台"><span class="brand-mark"><img :src="albireoLogo" alt="Albireo 狐狸" /></span><span class="brand-copy"><strong>Albireo</strong><small>内容管理工作空间</small></span></router-link>
      <nav class="nav-groups">
        <div v-for="group in navigationGroups" :key="group.label" class="nav-group">
          <div class="nav-label">{{ group.label }}</div>
          <router-link v-for="item in group.items" :key="item.path" :to="item.path" class="nav-link" :class="{ 'is-active': isActive(item.path) }" :aria-current="isActive(item.path) ? 'page' : undefined" :title="collapsed ? item.label : undefined" :aria-label="item.label">
            <n-icon :component="item.icon" :size="19" /><span>{{ item.label }}</span><span v-if="isActive(item.path)" class="active-dot" />
          </router-link>
        </div>
      </nav>
      <div class="sidebar-footer">
        <router-link to="/profile" class="account-link" title="个人设置" aria-label="个人设置"><span class="account-avatar">{{ (auth.username || 'A').charAt(0).toUpperCase() }}</span><span class="account-copy"><strong>{{ auth.username || '管理员' }}</strong><small>管理账户</small></span><n-icon :component="SettingsOutline" :size="17" /></router-link>
        <button class="collapse-control" :aria-label="collapsed ? '展开侧栏' : '收起侧栏'" :aria-expanded="!collapsed" @click="toggleCollapsed"><n-icon :component="collapsed ? ChevronForwardOutline : ChevronBackOutline" :size="17" /><span>收起侧栏</span></button>
        <button class="mobile-close" @click="mobileOpen = false">关闭导航</button>
      </div>
    </aside>
    <div class="workspace" :inert="isMobile && mobileOpen">
      <AppHeader @toggle-menu="mobileOpen = !mobileOpen" @open-search="searchOpen = true" />
      <main id="main-content" ref="mainContent" class="content-wrapper" tabindex="-1">
        <router-view v-slot="{ Component }"><Transition name="page" mode="out-in"><div :key="route.path" class="page-view"><component :is="Component" /></div></Transition></router-view>
      </main>
    </div>
    <n-modal v-model:show="searchOpen" preset="card" title="快速前往" class="search-modal" :bordered="false" @after-enter="searchInput?.focus()">
      <n-input ref="searchInput" v-model:value="searchKeyword" placeholder="搜索页面、功能…" clearable size="large" :input-props="{ 'aria-label': '搜索管理页面' }" @keydown.enter.prevent="openFirstResult"><template #prefix><n-icon :component="SearchOutline" /></template></n-input>
      <div class="search-results">
        <router-link v-for="item in searchResults" :key="item.path" :to="item.path" class="search-result" @click="searchOpen = false"><span class="search-icon"><n-icon :component="item.icon" :size="20" /></span><span><strong>{{ item.label }}</strong><small>{{ item.description }}</small></span><n-icon class="result-arrow" :component="ArrowForwardOutline" /></router-link>
        <n-empty v-if="!searchResults.length" description="没有匹配的页面，试试其他关键词" />
      </div>
      <div class="search-hint">Enter 打开首项 · Tab 选择页面 · Esc 关闭</div>
    </n-modal>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useLoadingBar, useMessage, type InputInst } from 'naive-ui'
import { SettingsOutline, ChevronBackOutline, ChevronForwardOutline, SearchOutline, ArrowForwardOutline } from '@vicons/ionicons5'
import { navigationGroups, searchablePages } from '../config/navigation'
import { useAuthStore } from '../stores/auth'
import AppHeader from './AppHeader.vue'
const albireoLogo = `${import.meta.env.BASE_URL}albireo-favicon.svg`
const route = useRoute(), router = useRouter(), auth = useAuthStore()
const loadingBar = useLoadingBar(), message = useMessage()
const collapsed = ref(localStorage.getItem('albireo-sidebar-collapsed') === 'true')
const mobileOpen = ref(false), searchOpen = ref(false), searchKeyword = ref('')
const mainContent = ref<HTMLElement | null>(null), searchInput = ref<InputInst | null>(null)
const sidebar = ref<HTMLElement | null>(null)
let menuTrigger: HTMLElement | null = null
const mobileQuery = window.matchMedia('(max-width: 960px)')
const isMobile = ref(mobileQuery.matches)
function onViewportChange() { isMobile.value = mobileQuery.matches; mobileOpen.value = false }
const searchResults = computed(() => { const q = searchKeyword.value.trim().toLowerCase(); return searchablePages.filter(item => `${item.label} ${item.description}`.toLowerCase().includes(q)) })
function isActive(path: string) { return path === '/' ? route.path === '/' : route.path === path || route.path.startsWith(`${path}/`) }
function toggleCollapsed() { collapsed.value = !collapsed.value; localStorage.setItem('albireo-sidebar-collapsed', String(collapsed.value)) }
function openFirstResult() { if (searchResults.value[0]) { router.push(searchResults.value[0].path); searchOpen.value = false } }
function onKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchOpen.value = !searchOpen.value }
  if (event.key === 'Escape') mobileOpen.value = false
  if (event.key === 'Tab' && mobileOpen.value && isMobile.value) {
    const links = Array.from(sidebar.value?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') || []).filter(element => element.getClientRects().length)
    if (!links?.length) return
    const first = links[0]!, last = links[links.length - 1]!
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }
}
watch(mobileOpen, async open => {
  if (open) { menuTrigger = document.activeElement as HTMLElement; await nextTick(); sidebar.value?.querySelector<HTMLElement>('a')?.focus() }
  else { await nextTick(); if (isMobile.value) menuTrigger?.focus() }
})
watch(() => route.path, () => { mobileOpen.value = false; mainContent.value?.scrollTo({ top: 0 }); })
watch(searchOpen, open => { if (open) searchKeyword.value = '' })
const removeBeforeHook = router.beforeEach(() => { loadingBar.start() })
const removeAfterHook = router.afterEach(() => { loadingBar.finish() })
const removeErrorHook = router.onError(() => { loadingBar.error(); message.error('页面加载失败，请检查网络后重试') })
onMounted(() => { window.addEventListener('keydown', onKeydown); mobileQuery.addEventListener('change', onViewportChange) })
onBeforeUnmount(() => { window.removeEventListener('keydown', onKeydown); mobileQuery.removeEventListener('change', onViewportChange); removeBeforeHook(); removeAfterHook(); removeErrorHook() })
</script>
<style scoped>
.mobile-close { display: none; }
.brand-mark img { width: 34px; height: 36px; object-fit: contain;  }
.admin-shell { --sidebar-width: 224px; display: flex; height: 100vh; height: 100dvh; overflow: hidden; }.admin-shell.is-collapsed { --sidebar-width: 76px; }
.sidebar { width: var(--sidebar-width); flex-shrink: 0; background: #fff; border-right: 1px solid var(--admin-border); display: flex; flex-direction: column; transition: width .22s ease, transform .22s ease; z-index: 100; }
.brand { height: 89px; display: flex; align-items: center; gap: 11px; padding: 0 23px; flex-shrink: 0; overflow: hidden; }.brand-mark { width: 34px; height: 36px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: #151515; color: #f6d34a; border-radius: 11px; font-size: 32px; font-weight: 700; letter-spacing: -3px;  line-height: 1; }.brand-mark span { color: #c6e5bd; }.brand-copy, .account-copy { display: flex; flex-direction: column; white-space: nowrap; min-width: 0; }.brand-copy strong { font-size: 22px; letter-spacing: -.7px; line-height: 1.35; }.brand-copy small { font-size: 10px; color: var(--admin-muted); letter-spacing: 1px; }
.nav-groups { overflow-y: auto; overflow-x: hidden; flex: 1; padding: 3px 14px 20px; scrollbar-width: thin; }.nav-group + .nav-group { margin-top: 23px; }.nav-label { padding: 0 12px 8px; color: #829887; font-size: 11px; letter-spacing: 1px; white-space: nowrap; }.nav-link { height: 41px; margin-bottom: 3px; display: flex; align-items: center; gap: 12px; padding: 0 13px; color: #5e7264; border-radius: 8px; transition: background .16s ease, color .16s ease; white-space: nowrap; position: relative; font-size: 13px; }.nav-link:hover { color: var(--admin-accent); background: var(--admin-hover); }.nav-link.is-active { background: var(--admin-accent-soft); color: var(--admin-accent); font-weight: 600; }.nav-link .n-icon { flex-shrink: 0; color: var(--admin-icon); }.nav-link.is-active .n-icon, .nav-link:hover .n-icon { color: var(--admin-accent); }.active-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--admin-accent); margin-left: auto; }
.sidebar-footer { border-top: 1px solid var(--admin-border); padding: 14px; }.account-link { display: flex; gap: 10px; align-items: center; padding: 4px 5px 12px; }.account-avatar { display: grid; place-items: center; width: 33px; height: 33px; flex-shrink: 0; border-radius: 50%; background: var(--admin-accent-soft); color: var(--admin-accent); font-weight: 600; }.account-copy { flex: 1; }.account-copy strong { overflow: hidden; text-overflow: ellipsis; font-size: 12px; }.account-copy small { color: #829887; font-size: 10px; }.collapse-control { border: 0; background: var(--admin-hover); border-radius: 7px; height: 30px; width: 100%; color: var(--admin-muted); display: flex; align-items: center; justify-content: center; gap: 7px; font-size: 11px; }
.is-collapsed .brand { padding: 0 20px; }.is-collapsed .brand-copy, .is-collapsed .nav-label, .is-collapsed .nav-link span, .is-collapsed .account-copy, .is-collapsed .account-link > .n-icon, .is-collapsed .collapse-control span { display: none; }.is-collapsed .nav-groups { padding-inline: 12px; }.is-collapsed .nav-link { justify-content: center; padding: 0; }.is-collapsed .nav-group + .nav-group { padding-top: 15px; margin-top: 15px; border-top: 1px solid var(--admin-border); }
.workspace { min-width: 0; flex: 1; display: flex; flex-direction: column; }.content-wrapper { flex: 1; overflow: auto; position: relative; scrollbar-gutter: stable; outline: none; }.page-view { min-height: 100%; }.skip-link { position: fixed; left: 250px; top: -60px; z-index: 1000; background: #fff; padding: 10px 16px; border-radius: 8px; }.skip-link:focus { top: 8px; }.sidebar-scrim { display: none; }
.search-modal { width: 560px; }.search-results { max-height: min(440px, 60vh); overflow-y: auto; margin: 14px -6px 0; padding: 0 6px; }.search-result { display: flex; gap: 12px; align-items: center; padding: 11px; border-radius: 9px; margin: 3px 0; }.search-result:hover, .search-result:focus { background: var(--admin-accent-soft); }.search-icon { display: grid; place-items: center; width: 36px; height: 36px; background: var(--admin-accent-soft); border-radius: 9px; color: var(--admin-accent); }.search-result strong, .search-result small { display: block; }.search-result strong { font-size: 13px; }.search-result small { color: var(--admin-muted); margin-top: 3px; font-size: 11px; }.result-arrow { margin-left: auto; color: #829887; }.search-hint { margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--admin-border); color: var(--admin-muted); font-size: 11px; }
@media(max-width:960px) {
  .mobile-close { display: block; width: 100%; border: 0; border-radius: 7px; background: var(--admin-bg); color: var(--admin-muted); padding: 7px; font-size: 12px; }
  .sidebar, .is-collapsed .sidebar { position: fixed; inset: 0 auto 0 0; width: 224px; transform: translateX(-100%); }.sidebar.is-open { transform: translateX(0); }.sidebar-scrim { display: block; position: fixed; inset: 0; background: #17362644; border: 0; z-index: 99; backdrop-filter: blur(3px); }
  .is-collapsed .brand-copy, .is-collapsed .nav-label, .is-collapsed .nav-link span, .is-collapsed .account-copy { display: initial; }.is-collapsed .brand-copy { display: flex; }.is-collapsed .nav-link { justify-content: flex-start; padding-inline: 13px; }.collapse-control { display: none; }.skip-link { left: 60px; }
}
</style>
