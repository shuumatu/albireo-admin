<template>
  <div class="cover-image-selector">
    <n-flex vertical style="padding: 0 32px; height: 100%;">
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
            style="width: 300px;"
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
        <n-grid cols="4" x-gap="16" y-gap="16">
          <n-grid-item v-for="img in images" :key="img.id">
            <n-card 
              size="small" 
              hoverable 
              @click="selectCover(img)"
              :class="{ 'selected-cover': selectedCoverId === img.id }"
            >
              <n-flex vertical>
                <n-flex justify="center">
                  <n-image 
                    :src="img.imageUrl" 
                    width="100%" 
                    height="150px" 
                    object-fit="cover"
                  />
                </n-flex>
                <n-flex justify="center">
                  {{ img.fileName }}
                </n-flex>
              </n-flex>
            </n-card>
          </n-grid-item>
        </n-grid>
      </div>
      
      <!-- 底部操作区 - 固定高度 -->
      <div class="footer-section">
        <!-- 分页 -->
        <n-flex justify="flex-end" style="width: 100%; margin-bottom: 16px;">
          <n-pagination
            v-model:page="page"
            v-model:page-size="pageSize"
            :item-count="itemCount"
            show-size-picker
            :page-sizes="[10, 20, 50, 100]"
            @update:page="loadImages"
            @update:page-size="loadImages"
          />
        </n-flex>
        
        <!-- 确认按钮 -->
        <n-flex justify="center">
          <n-button 
            type="primary" 
            size="large"
            :disabled="!selectedCoverId"
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
import { ref, onMounted } from 'vue'
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

async function loadImages() {
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
  // @ts-ignore
  images.value = res.data
  // @ts-ignore
  itemCount.value = res.total
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
</script>

<style scoped>
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
  border-top: 1px solid #f0f0f0;
}

.selected-cover {
  background-color: #e6f7ff !important;
  border: 2px solid #1890ff !important;
  transform: translateY(2px);
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
}
</style>