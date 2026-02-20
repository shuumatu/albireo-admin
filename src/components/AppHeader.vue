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

    <!-- 右侧菜单 -->
    <div class="menu-wrapper">
      <n-menu
        mode="horizontal"
        :options="menuOptions"
        :value="activeKey"
        @update:value="handleMenuSelect"
        class="menu"
        
      />
    </div>
  </n-layout-header>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const activeKey = ref(route.path)

// 根据当前路径更新激活菜单项
watch(route, () => {
  activeKey.value = route.path
})

// 菜单选项
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
        label: '系统配置',
        key: '/manager/system-config'
      }
    ]
  }
]

// 点击菜单时导航
function handleMenuSelect(key) {
  router.push(key)
  
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
