<template>
  <n-config-provider :locale="zhCN" :date-locale="dateZhCN">
    <n-loading-bar-provider>
      <n-message-provider>
        <n-layout>
          <n-layout-header bordered>
            <AppHeader />
            <Breadcrumb v-if="$route.meta && $route.meta.title"/>
          </n-layout-header>
          
          <n-layout-content>
            <div class="content-wrapper">
              <router-view />
            </div>
          </n-layout-content>
        </n-layout>
      </n-message-provider>
    </n-loading-bar-provider>
  </n-config-provider>
</template>

<script setup>
import { zhCN, dateZhCN } from 'naive-ui'
import AppHeader from './components/AppHeader.vue'
import Breadcrumb from './components/Breadcrumb.vue'
</script>

<style scoped>
.content-wrapper {
  min-height: calc(100vh - 64px);
  width: 100%;
  position: relative;
}
</style>
