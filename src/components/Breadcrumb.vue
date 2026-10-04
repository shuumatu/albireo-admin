<template>
  <nav class="breadcrumb" aria-label="面包屑导航">
    <router-link to="/" class="home-crumb"><n-icon :component="GridOutline" :size="15" /><span>工作空间</span></router-link>
    <template v-if="route.path !== '/'"><n-icon :component="ChevronForwardOutline" :size="12" class="separator" /><template v-if="parent"><router-link :to="parent.path">{{ parent.meta.title }}</router-link><n-icon :component="ChevronForwardOutline" :size="12" class="separator" /></template><span class="current" aria-current="page">{{ route.meta.title || '工作台' }}</span></template>
  </nav>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { GridOutline, ChevronForwardOutline } from '@vicons/ionicons5'
const route = useRoute(), router = useRouter()
const parent = computed(() => route.meta.parent ? router.getRoutes().find(item => item.name === route.meta.parent) : undefined)
</script>
<style scoped>
.home-crumb :deep(.n-icon) { color: var(--admin-icon); }
.breadcrumb { display: flex; gap: 12px; align-items: center; font-size: 12px; color: var(--admin-muted); min-width: 0; white-space: nowrap; }.home-crumb { display: flex; gap: 8px; align-items: center; }.breadcrumb a:hover { color: var(--admin-accent); }.current { color: var(--admin-text); overflow: hidden; text-overflow: ellipsis; }.separator { color: #a8b9ac; flex-shrink: 0; }@media(max-width:640px) { .breadcrumb { gap: 7px; }.home-crumb span { display: none; } }
</style>
