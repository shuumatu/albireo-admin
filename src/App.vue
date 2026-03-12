<template>
  <n-config-provider :locale="zhCN" :date-locale="dateZhCN">
    <n-loading-bar-provider>
      <n-dialog-provider>
      <n-message-provider>
        <!-- 登录页：不显示布局框架 -->
        <template v-if="isLoginPage">
          <router-view />
        </template>

        <!-- 其他页面：显示完整布局 -->
        <n-layout v-else>
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
      </n-dialog-provider>
    </n-loading-bar-provider>
  </n-config-provider>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { zhCN, dateZhCN } from 'naive-ui'
import AppHeader from './components/AppHeader.vue'
import Breadcrumb from './components/Breadcrumb.vue'

const route = useRoute()
const isLoginPage = computed(() => route.name === 'login')
</script>

<style scoped>
.content-wrapper {
  min-height: calc(100vh - 64px);
  width: 100%;
  position: relative;
}
</style>
