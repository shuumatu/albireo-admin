<template>
  <n-breadcrumb class="cool-breadcrumb" style="margin-left: 13px;"
  >
    <n-breadcrumb-item
      v-for="(item, index) in breadcrumbRoutes"
      :key="item.path"
      :clickable="index !== breadcrumbRoutes.length - 1"
      @click="goTo(item, index)"
      style="cursor: pointer;"
    >
    <template #separator>
        <n-flex>
            <img
                src="../assets/ChevronRight16Regular.svg"
                alt=">"
                style="width: 20px; height: 20px; opacity: 0.6;"
            />
        </n-flex>
    </template>
        {{ item.meta.title }}
    </n-breadcrumb-item>
  </n-breadcrumb>
</template>

<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router'
import { computed } from 'vue'

const router = useRouter()
const route = useRoute()

// 生成面包屑数据，支持平级路由用 meta.parent 找父级
const breadcrumbRoutes = computed(() => {
  const crumbs = []
  let currentRoute = route

  while (currentRoute) {
    crumbs.unshift(currentRoute) // 头部插入

    // 如果 meta.parent 存在，找父级路由
    if (currentRoute.meta.parent) {
      const parentRoute = router
        .getRoutes()
        .find(r => r.name === currentRoute.meta.parent)
      if (parentRoute) {
        currentRoute = {
          path: parentRoute.path,
          meta: parentRoute.meta
        } as any
        continue
      }
    }
    break
  }

  return crumbs
})

function goTo(routeItem: any, index: number) {
  if (index < breadcrumbRoutes.value.length - 1) {
    router.push(routeItem.path)
  }
}
</script>

<style scoped>
.cool-breadcrumb :deep(.n-breadcrumb-item__link) {
  font-family: 'FOT-TelopMinProN-E';
  font-weight: 600;
  font-size: 18px;
  background: linear-gradient(90deg, rgba(0, 255, 0, 0.8), rgba(0,150,0,0.8));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  transition: all 0.3s;
  position: relative;
}

/* hover 发光效果 */
.cool-breadcrumb :deep(.n-breadcrumb-item__link:hover) {
  text-shadow: 0 0 6px rgba(79, 172, 254, 0.6);
}

/* hover 下划线动画 */
.cool-breadcrumb :deep(.n-breadcrumb-item__link)::after {
  content: '';
  position: absolute;
  left: 0;
  bottom: -2px;
  width: 0%;
  height: 2px;
  background: linear-gradient(90deg, #0088ff, #ffd500);
  transition: width 0.3s ease;
}
.cool-breadcrumb :deep(.n-breadcrumb-item__link:hover)::after {
  width: 100%;
}
</style>
