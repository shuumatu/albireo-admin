<script setup lang="ts">
import { navigationGroups } from '../config/navigation'
const pages = navigationGroups.find(group => group.label === '处理与设置')!.items
</script>
<template>
  <nav class="processing-navigation" aria-label="处理与设置页面导航">
    <router-link v-for="page in pages" :key="page.path" :to="page.path" :title="page.description">{{ page.label }}</router-link>
  </nav>
</template>
<style scoped>
.processing-navigation { display:flex; gap:6px; overflow-x:auto; padding:6px; margin:0 0 24px; background:var(--n-card-color); border:1px solid var(--n-divider-color); border-radius:12px; }
a { flex:1; padding:10px 14px; border-radius:8px; white-space:nowrap; color:var(--n-text-color-3); font-size:13px; text-align:center; text-decoration:none; }
a:hover { background:var(--admin-hover,#f0f7ef); }a.router-link-active { background:var(--admin-accent-soft,#e6f3e9); color:var(--admin-accent,#2f7b5b); font-weight:600; }a:focus-visible { outline:2px solid var(--admin-accent,#2f7b5b); }
@media(max-width:680px) { a { padding:9px 12px; } }
</style>
