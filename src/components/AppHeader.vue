<template>
  <n-layout-header class="header" bordered>
    <!-- 左侧 logo -->
    <div class="logo">
      <router-link to="/">
        <img
          src="https://albireo.shuumatu.com/uploads/0e84dd80119bbfc52609e5e4fda0b57.png"
          alt="Logo"
        />
      </router-link>
    </div>

    <!-- 中间菜单 -->
    <div class="menu-wrapper">
      <n-menu
        mode="horizontal"
        :options="menuOptions"
        :value="activeKey"
        @update:value="handleMenuSelect"
        class="menu"
        
      />
    </div>

    <!-- 右侧用户菜单 -->
    <div class="user-area">
      <n-dropdown :options="userMenuOptions" @select="handleUserMenuSelect">
        <n-button quaternary class="user-btn">
          <template #icon>
            <n-icon :component="PersonIcon" />
          </template>
          {{ authStore.username }}
        </n-button>
      </n-dropdown>
    </div>
  </n-layout-header>
</template>

<script setup lang="ts">
import { ref, watch, h } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NIcon, useDialog } from 'naive-ui'
import { PersonCircleOutline as PersonIcon, SettingsOutline, LogOutOutline } from '@vicons/ionicons5'
import { useAuthStore } from '../stores/auth'

const route = useRoute()
const router = useRouter()
const dialog = useDialog()
const authStore = useAuthStore()
const activeKey = ref(route.path)

watch(route, () => {
  activeKey.value = route.path
})

const menuOptions = [
  {
    label: '地图',
    key: '/map'
  },
  {
    label: '上传',
    key: '/upload'
  },
  {
    label: '管理',
    key: '/manager',
    children:[
      {
        label: '视频管理',
        key: '/manager/video'
      },
      {
        label: '合集管理',
        key: '/manager/collection'
      },
      {
        label: '图片管理',
        key: '/manager/image'
      },
      {
        label: '标签管理',
        key: '/manager/tag'
      },
      {
        label: '评论管理',
        key: '/manager/comment'
      },
      {
        label: '分享管理',
        key: '/manager/share'
      },
      {
        label: '系统配置',
        key: '/manager/system-config'
      },
      {
        label: '处理进度',
        key: '/manager/task-progress'
      }
    ]
  }
]

function renderIcon(icon: any) {
  return () => h(NIcon, null, { default: () => h(icon) })
}

const userMenuOptions = [
  {
    label: '个人设置',
    key: 'profile',
    icon: renderIcon(SettingsOutline)
  },
  {
    type: 'divider',
    key: 'd1'
  },
  {
    label: '退出登录',
    key: 'logout',
    icon: renderIcon(LogOutOutline)
  }
]

function handleMenuSelect(key: string) {
  router.push(key)
}

function handleUserMenuSelect(key: string) {
  if (key === 'profile') {
    router.push('/profile')
  } else if (key === 'logout') {
    dialog.warning({
      title: '确认退出',
      content: '确定要退出登录吗？',
      positiveText: '退出',
      negativeText: '取消',
      onPositiveClick: () => {
        authStore.logout()
        router.push('/login')
      }
    })
  }
}
</script>

<style scoped>
.header {
  background-color: black;
  color: white;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 64px;
  padding: 0 20px;
}

/* 左侧 logo */
.logo img {
  height: 40px;
}

/* 菜单容器 */
.menu-wrapper {
  display: flex;
  align-items: center;
  margin-left: auto;
}

/* 用户区域 */
.user-area {
  display: flex;
  align-items: center;
}

.user-btn {
  color: rgba(255, 255, 255, 0.85) !important;
  font-size: 14px;
}

.user-btn:hover {
  color: #fff !important;
}

/* 菜单样式 */
.menu :deep(.n-menu-item) {
  color: white;
  position: relative;
  padding: 0 20px;
}

/* 菜单项悬停样式 */
.menu :deep(.n-menu-item:hover) {
  background-color: #ffffff5e;
  color: white;
}

/* 菜单项之间添加竖线 */
.menu :deep(.n-menu-item:not(:last-child)::after) {
  content: '';
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  height: 20px;
  width: 1px;
  background-color: white;
}
</style>
