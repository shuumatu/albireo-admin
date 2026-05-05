<template>
  <!--
    视频管理页入口。具体实现拆分到了 src/views/video/* 下：
      - VideoListPage      主壳子（筛选 / 列表 / 抽屉 / 浮动栏的容器）
      - VideoCard          网格视图卡片
      - VideoListRow       列表视图行
      - VideoFilterBar     粘性顶栏 + chip
      - VideoFloatingActionBar 浮动批量操作栏
      - VideoEditDrawer    右侧编辑抽屉
      - VideoHoverPreview  悬停 480p 短预览 popover
      - VideoStatusOverlay 处理中 / 失败状态遮罩
      - composables/useVideoQuery   筛选 / 排序 / 分页 + URL 同步
      - composables/useVideoSelection 跨页选中状态
      - composables/videoFormat     纯函数（时长 / 分辨率 / 大小 / 时间 等）
    保持本文件薄是因为 router 已经引用了它，路径不变更省去其它处的改动。
  -->
  <VideoListPage />
</template>

<script setup lang="ts">
import VideoListPage from './video/VideoListPage.vue'
</script>
