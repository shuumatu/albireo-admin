<template>
  <n-config-provider :locale="zhCN" :date-locale="dateZhCN" :theme-overrides="themeOverrides">
    <n-loading-bar-provider>
      <n-dialog-provider>
        <n-message-provider :max="3">
          <router-view v-if="isLoginPage" />
          <AdminShell v-else />
        </n-message-provider>
      </n-dialog-provider>
    </n-loading-bar-provider>
  </n-config-provider>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { zhCN, dateZhCN, type GlobalThemeOverrides } from 'naive-ui'
import AdminShell from './components/AdminShell.vue'
const route = useRoute()
const isLoginPage = computed(() => route.name === 'login')
const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#2f7b5b', primaryColorHover: '#3f8d6b', primaryColorPressed: '#236347', primaryColorSuppl: '#2f7b5b',
    infoColor: '#52856b', infoColorHover: '#669c7e', infoColorPressed: '#3e6d55', infoColorSuppl: '#52856b',
    successColor: '#36845a', successColorHover: '#4b986e', successColorPressed: '#256b46', successColorSuppl: '#36845a',
    borderRadius: '9px', textColorBase: '#293c31', textColor1: '#293c31', textColor2: '#54695a', textColor3: '#647669',
    bodyColor: '#f5f9f5', borderColor: '#e0e9e1', dividerColor: '#e0e9e1',
    hoverColor: '#f0f7ef', pressedColor: '#e6f3e9', tableHeaderColor: '#f4f8f3',
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif",
  },
  Card: { borderRadius: '14px', titleFontWeight: '600' },
  DataTable: { thColor: '#f4f8f3', thFontWeight: '600', tdColorStriped: '#fafcf9', tdColorHover: '#eef7ed', borderColor: '#e5eee5' },
  Button: { fontWeight: '500' },
}
</script>
