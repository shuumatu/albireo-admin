<template><div class="not-found admin-page"><n-result status="404" title="找不到这个页面" description="页面可能已移动，试试从导航或页面搜索重新进入。"><template #footer><n-button type="primary" @click="router.push('/')">返回工作台</n-button></template></n-result></div></template>
<script setup lang="ts">
import { useRouter } from 'vue-router'
const router = useRouter()
</script>
<style scoped>.not-found { padding-top: 100px; }</style>
