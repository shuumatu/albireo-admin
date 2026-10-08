<template>
  <header class="app-header">
    <n-button class="mobile-menu" quaternary circle aria-label="打开导航" @click="$emit('toggle-menu')"><template #icon><n-icon :component="MenuOutline" /></template></n-button>
    <Breadcrumb />
    <div class="header-actions">
      <button class="search-trigger" aria-label="搜索页面，快捷键 Ctrl K" @click="$emit('open-search')"><n-icon :component="SearchOutline" :size="16" /><span>搜索页面</span><kbd>⌘ / Ctrl K</kbd></button>
      <n-tooltip><template #trigger><n-button quaternary circle aria-label="查看处理进度" @click="router.push('/manager/task-progress')"><template #icon><n-icon :component="PulseOutline" /></template></n-button></template>处理进度</n-tooltip>
      <span class="header-divider" />
      <n-dropdown :options="userMenuOptions" trigger="click" @select="handleUserMenuSelect"><n-button quaternary class="user-btn"><span class="user-avatar">{{ (authStore.username || 'A').charAt(0).toUpperCase() }}</span><span class="username">{{ authStore.username || '管理员' }}</span><n-icon :component="ChevronDownOutline" :size="13" /></n-button></n-dropdown>
    </div>
  </header>
</template>
<script setup lang="ts">
import { h } from 'vue'
import { useRouter } from 'vue-router'
import { NIcon, useDialog, useMessage } from 'naive-ui'
import { SettingsOutline, LogOutOutline, MenuOutline, SearchOutline, PulseOutline, ChevronDownOutline } from '@vicons/ionicons5'
import { useAuthStore } from '../stores/auth'
import { logout } from '../api/auth'
import Breadcrumb from './Breadcrumb.vue'
defineEmits<{ 'toggle-menu': []; 'open-search': [] }>()
const message = useMessage()
const router = useRouter(), dialog = useDialog(), authStore = useAuthStore()
const userMenuOptions = [
  { label: '个人设置', key: 'profile', icon: () => h(NIcon, null, { default: () => h(SettingsOutline) }) },
  { type: 'divider', key: 'divider' },
  { label: '退出登录', key: 'logout', icon: () => h(NIcon, null, { default: () => h(LogOutOutline) }) },
]
function handleUserMenuSelect(key: string) {
  if (key === 'profile') router.push('/profile')
  else if (key === 'logout') dialog.warning({ title: '退出登录', content: '确定退出当前管理账户吗？', positiveText: '退出', negativeText: '取消', onPositiveClick: async () => { try { await logout(); authStore.logout(); router.push('/login') } catch { message.error('退出失败，请重试'); return false } } })
}
</script>
<style scoped>
.app-header :deep(.n-icon) { color: var(--admin-icon); }
.app-header { height: 68px; flex-shrink: 0; padding: 0 32px; background: rgba(255,255,255,.95); border-bottom: 1px solid var(--admin-border); display: flex; align-items: center; gap: 14px; }.header-actions { margin-left: auto; display: flex; align-items: center; gap: 12px; }.search-trigger { height: 33px; display: flex; align-items: center; gap: 9px; padding: 0 10px; background: var(--admin-hover); border: 1px solid var(--admin-border); border-radius: 7px; color: var(--admin-muted); font-size: 12px; }.search-trigger kbd { font: inherit; font-size: 10px; color: #829887; margin-left: 30px; }.header-divider { height: 22px; width: 1px; background: var(--admin-border); }.user-btn :deep(.n-button__content) { gap: 9px; }.username { max-width: 100px; overflow: hidden; text-overflow: ellipsis; font-size: 12px; }.user-avatar { width: 28px; height: 28px; display: grid; place-items: center; border-radius: 50%; background: var(--admin-accent-soft); color: var(--admin-accent); font-size: 11px; }.mobile-menu { display: none; }
@media(max-width:960px) { .mobile-menu { display: flex; }.app-header { padding: 0 16px; } }
@media(max-width:640px) { .app-header { height: 58px; padding: 0 10px; gap: 6px; }.header-actions { gap: 3px; }.search-trigger { border: 0; background: transparent; }.search-trigger span, .search-trigger kbd, .username, .header-divider { display: none; } }
</style>
