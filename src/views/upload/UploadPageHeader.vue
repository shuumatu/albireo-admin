<template>
  <div class="upload-page-header">
    <div class="upload-page-header__title-row">
      <n-icon size="24" :depth="2" class="upload-page-header__icon">
        <CloudUploadIcon />
      </n-icon>
      <h2 class="upload-page-header__title">素材上传</h2>
    </div>
    <p class="upload-page-header__subtitle">
      支持图片与视频，最大单文件 5GB，可批量上传 / 暂停 / 断点续传 / 秒传
    </p>
    <n-flex size="small" class="upload-page-header__tags">
      <n-tag size="small" :bordered="false" type="info">image/*</n-tag>
      <n-tag size="small" :bordered="false" type="info">video/*</n-tag>
      <n-tag size="small" :bordered="false" type="success">SHA-256 秒传</n-tag>
      <n-tag size="small" :bordered="false">分片并发</n-tag>
      <n-tag size="small" :bordered="false">断点续传</n-tag>
      <n-tag size="small" :bordered="false">EXIF 提取</n-tag>
    </n-flex>
  </div>
</template>

<script setup lang="ts">
import { CloudUploadOutline as CloudUploadIcon } from '@vicons/ionicons5'
</script>

<style scoped>
.upload-page-header {
  padding: 4px 0 8px;
}
.upload-page-header__title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.upload-page-header__icon {
  color: var(--n-text-color);
}
.upload-page-header__title {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  color: var(--n-text-color);
}
.upload-page-header__subtitle {
  margin: 6px 0 12px;
  color: var(--n-text-color-3);
  font-size: 13px;
}
.upload-page-header__tags {
  flex-wrap: wrap;
}
</style>
