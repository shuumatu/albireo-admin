<template>
  <div class="cover-image-selector">
    <n-flex vertical class="selector-layout">
      <!-- 标题栏 - 固定高度 -->
      <div class="header-section">
        <n-flex justify="space-between" align="center" class="mb-4">
          <h2>选择封面图片</h2>
        </n-flex>
        
        <!-- 筛选条件 -->
        <n-flex align="center" class="mb-4">
          <n-select
            v-model:value="selectedCollectionId"
            placeholder="选择合集筛选（可选）"
            clearable
            style="width: min(300px, 100%);"
            :options="collectionOptions"
            @update:value="handleCollectionChange"
          />
          <n-button @click="clearFilter" style="margin-left: 12px;">
            清除筛选
          </n-button>
        </n-flex>
      </div>
      
      <!-- 图片网格 - 可滚动区域 -->
      <div class="content-section">
        <n-alert v-if="loadError" type="error" style="margin-bottom: 14px">{{ loadError }} <n-button text type="error" @click="loadImages">重试</n-button></n-alert>
        <n-spin :show="loading">
        <n-empty v-if="!loading && !loadError && !images.length" description="当前没有可用的封面图片" />
        <n-grid cols="1 360:2 640:3 900:4" responsive="self" x-gap="16" y-gap="16">
          <n-grid-item v-for="img in images" :key="img.id">
            <n-card 
              size="small" 
              hoverable 
              @click="selectCover(img)"
              role="button"
              tabindex="0"
              :aria-label="`选择 ${img.title || img.fileName} 作为封面`"
              :aria-pressed="selectedCoverId === img.id"
              @keydown.enter.prevent="selectCover(img)"
              @keydown.space.prevent="selectCover(img)"
              :class="{ 'selected-cover': selectedCoverId === img.id }"
            >
              <n-flex vertical>
                <n-flex justify="center">
                  <MediaImage :renditions="img.renditions"
                    :src="img.mediumUrl || img.thumbnailUrl || img.imageUrl"
                    style="width: 100%; height: 150px"
                    :alt="img.title || img.fileName"
                  />
                </n-flex>
                <n-flex justify="center" style="overflow-wrap: anywhere;">
                  {{ img.fileName }}
                </n-flex>
              </n-flex>
            </n-card>
          </n-grid-item>
        </n-grid>
        </n-spin>
      </div>
      
      <!-- 底部操作区 - 固定高度 -->
      <div class="footer-section">
        <!-- 分页 -->
        <n-flex justify="flex-end" style="width: 100%; margin-bottom: 16px;">
          <n-pagination
            v-model:page="page"
            v-model:page-size="pageSize"
            :item-count="itemCount"
            :disabled="loading"
            :page-slot="5"
            show-size-picker
            :page-sizes="[10, 20, 50, 100]"
            @update:page="loadImages"
            @update:page-size="() => { page = 1; loadImages() }"
          />
        </n-flex>
        
        <!-- 确认按钮 -->
        <n-flex justify="center">
          <n-button 
            type="primary" 
            size="large"
            :disabled="!selectedCoverId || loading"
            @click="confirmSelection"
          >
            确认选择
          </n-button>
        </n-flex>
      </div>
    </n-flex>
  </div>
</template>

<script setup lang="ts">
import MediaImage from './MediaImage.vue'

import { ref, onMounted, onBeforeUnmount } from 'vue'
import { fetchImages, fetchImagesWithCollectionId } from '../api/images'
import { fetchImageCollectionsIds } from '../api/manager'
import type { ImageItem } from '../api/images'

const emit = defineEmits<{
  'cover-selected': [image: ImageItem]
}>()

const images = ref<ImageItem[]>([])
const selectedCoverId = ref<number | null>(null)
const selectedCollectionId = ref<number | null>(null)
const collectionOptions = ref<{ label: string; value: number }[]>([])
const page = ref(1)
const pageSize = ref(20)
const itemCount = ref(0)
const loading = ref(false)
const loadError = ref('')
let requestSequence = 0

async function loadImages() {
  const sequence = ++requestSequence
  loading.value = true
  loadError.value = ''
  selectedCoverId.value = null
  try {
  let res
  if (selectedCollectionId.value) {
    // 如果选择了合集筛选，则只获取该合集的图片
    res = await fetchImagesWithCollectionId(selectedCollectionId.value, {
      page: page.value,
      pageSize: pageSize.value
    })
  } else {
    // 否则获取所有图片
    res = await fetchImages({
      page: page.value,
      pageSize: pageSize.value
    })
  }
    if (sequence !== requestSequence) return
    const result = res as unknown as { data: ImageItem[]; total: number }
    images.value = result.data
    itemCount.value = result.total
  } catch {
    if (sequence === requestSequence) { images.value = []; loadError.value = '封面图片加载失败，请稍后重试。' }
  } finally { if (sequence === requestSequence) loading.value = false }
}

async function fetchCollections() {
  try {
    const res = await fetchImageCollectionsIds()
    collectionOptions.value = res.map(c => ({
      label: c.name,
      value: Number(c.id) // 确保转换为 number 类型
    }))
  } catch (error) {
    console.error('获取合集列表失败:', error)
  }
}

function handleCollectionChange() {
  page.value = 1 // 重置到第一页
  loadImages()
}

function clearFilter() {
  selectedCollectionId.value = null
  page.value = 1
  loadImages()
}



function selectCover(img: ImageItem) {
  selectedCoverId.value = img.id
}

function confirmSelection() {
  if (loading.value) return
  if (selectedCoverId.value) {
    const selectedImage = images.value.find(img => img.id === selectedCoverId.value)
    if (selectedImage) {
      emit('cover-selected', selectedImage)
    }
  }
}

onMounted(async () => {
  await Promise.all([
    loadImages(),
    fetchCollections()
  ])
})
onBeforeUnmount(() => { requestSequence++ })
</script>

<style scoped>
.selector-layout { height: 100%; padding: 0 8px; min-height: 0; }
.footer-section :deep(.n-pagination) { flex-wrap: wrap; justify-content: center; gap: 6px; }
.cover-image-selector {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.header-section {
  flex-shrink: 0; /* 固定高度，不收缩 */
}

.content-section {
  flex: 1; /* 占据剩余空间 */
  overflow-y: auto; /* 内容超出时滚动 */
  min-height: 0; /* 允许 flex 子项收缩 */
}

.footer-section {
  flex-shrink: 0; /* 固定高度，不收缩 */
  padding-top: 16px;
  border-top: 1px solid var(--admin-border, #e0e9e1);
}

.selected-cover {
  background-color: var(--admin-accent-soft, #e6f3e9) !important;
  border: 2px solid var(--admin-accent, #2f7b5b) !important;
  transform: translateY(2px);
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
}
</style>
