<template>
  <div class="detail-page">

    <!-- 返回 + 页面头 -->
    <div class="page-header">
      <n-button text @click="goList" class="back-btn">
        <template #icon><n-icon><ArrowLeft24Regular /></n-icon></template>
        合集管理
      </n-button>
      <div class="header-title">
        <h1 class="page-title">{{ collection.name || '加载中...' }}</h1>
        <n-tag size="small" :bordered="false" type="info" style="margin-left: 8px;">
          {{ collectionDetailStore.img ? '图片合集' : '视频合集' }}
        </n-tag>
      </div>
    </div>

    <!-- 合集信息卡片：封面 + 表单 两栏布局 -->
    <div class="info-card">
      <!-- 左侧：封面 -->
      <div class="cover-section">
        <div class="cover-frame">
          <n-image
            v-if="collection.imageUrl"
            :src="collection.imageUrl"
            object-fit="cover"
            class="cover-img"
            :preview-disabled="false"
          />
          <div v-else class="cover-empty">
            <n-icon size="48" color="#ccc">
              <component :is="collectionDetailStore.img ? Image24Regular : VideoClip24Regular" />
            </n-icon>
            <span class="cover-empty-text">暂无封面</span>
          </div>
        </div>
        <n-button class="cover-btn" @click="chooseCover" block secondary>
          <template #icon><n-icon><ImageEdit24Regular /></n-icon></template>
          更换封面
        </n-button>
        <div class="meta-row" v-if="collection.createdAt">
          <n-icon size="14" color="#aaa"><CalendarLtr24Regular /></n-icon>
          <n-text depth="3" style="font-size: 12px;">
            创建于 {{ dayjs(collection.createdAt).format('YYYY年MM月DD日') }}
          </n-text>
        </div>
      </div>

      <!-- 右侧：表单 -->
      <div class="form-section">
        <div class="section-label">基本信息</div>
        <n-form :model="collection" label-placement="top">
          <n-form-item label="合集名称">
            <n-input
              v-model:value="collection.name"
              placeholder="请输入合集名称"
              size="large"
            />
          </n-form-item>
          <n-form-item label="描述">
            <n-input
              v-model:value="collection.description"
              type="textarea"
              placeholder="添加一段描述..."
              :rows="4"
            />
          </n-form-item>
        </n-form>
        <div class="form-actions">
          <n-button type="primary" size="large" @click="saveCollection">
            <template #icon><n-icon><Save24Regular /></n-icon></template>
            保存
          </n-button>
        </div>
      </div>
    </div>

    <!-- 媒体管理卡片 -->
    <div class="media-card">
      <div class="media-header">
        <div class="media-header-left">
          <n-icon size="18" class="media-icon">
            <component :is="collectionDetailStore.img ? Image24Regular : VideoClip24Regular" />
          </n-icon>
          <span class="media-title">{{ collectionDetailStore.img ? '合集图片' : '合集视频' }}</span>
        </div>
        <n-button type="primary" @click="openAddItemsModal">
          <template #icon><n-icon><Add24Filled /></n-icon></template>
          添加{{ collectionDetailStore.img ? '图片' : '视频' }}
        </n-button>
      </div>
      <div class="media-body">
        <VideoMetaManager v-if="!collectionDetailStore.img" :key="refreshKey" />
        <ImageManager v-else :key="refreshKey" />
      </div>
    </div>

  </div>

  <!-- 封面选择弹窗 -->
  <n-modal
    v-model:show="showCoverModal"
    title="选择封面"
    preset="card"
    style="width: 80vw; height: 80vh;"
    :mask-closable="false"
  >
    <div style="height: calc(80vh - 120px);">
      <CoverImageSelector @cover-selected="handleCoverSelected" />
    </div>
  </n-modal>

  <!-- 添加视频/图片到合集弹窗 -->
  <n-modal
    v-model:show="showAddItemsModal"
    :title="'添加' + (collectionDetailStore.img ? '图片' : '视频') + '到合集'"
    preset="card"
    style="width: 80vw;"
    :mask-closable="false"
  >
    <n-spin :show="addItemsLoading">
      <n-data-table
        :columns="addItemsColumns"
        :data="allItems"
        :row-key="(row: any) => row.id"
        v-model:checked-row-keys="addItemsSelectedKeys"
        :max-height="400"
      />
    </n-spin>
    <n-flex justify="space-between" align="center" style="margin-top: 16px;">
      <n-pagination
        v-model:page="addItemsPage"
        v-model:page-size="addItemsPageSize"
        :item-count="addItemsTotalCount"
        show-size-picker
        :page-sizes="[10, 20, 50]"
        @update:page="fetchAllItems"
        @update:page-size="handleAddItemsPageSizeChange"
      />
      <n-flex>
        <n-button @click="showAddItemsModal = false">取消</n-button>
        <n-button
          type="primary"
          @click="confirmAddItems"
          :disabled="addItemsSelectedKeys.length === 0"
        >
          添加选中 ({{ addItemsSelectedKeys.length }})
        </n-button>
      </n-flex>
    </n-flex>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeMount, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMessage, type DataTableColumns } from 'naive-ui'
import dayjs from 'dayjs'
import VideoMetaManager from './VideoMetaManager.vue'
import ImageManager from './ImageManager.vue'
import { useCollectionStore, useCollectionDetailStore } from '../stores/collection'
import { fetchCollectionWithCover, fetchImageCollectionWithCover, fetchVideoList, addVideosToCollections } from '../api/manager'
import { useImageManagerStore } from '../stores/imageManager'
import CoverImageSelector from '../components/CoverImageSelector.vue'
import { saveImageCollection, saveVideoCollection, updateImageCollectionCover, updateVideoCollectionCover } from '../api/collection'
import { fetchImages, addImagesToCollections } from '../api/images'
import type { ImageItem } from '../api/images'
import {
  ArrowLeft24Regular,
  Image24Regular,
  VideoClip24Regular,
  ImageEdit24Regular,
  CalendarLtr24Regular,
  Save24Regular,
  Add24Filled,
} from '@vicons/fluent'

const collectionStore = useCollectionStore()
const imageManagerStore = useImageManagerStore()
const collectionDetailStore = useCollectionDetailStore()
const route = useRoute()
const router = useRouter()
const message = useMessage()

const idParam = route.params.id
const id = Array.isArray(idParam) ? parseInt(idParam[0], 10) : parseInt(idParam as string, 10)

const collection = ref<any>({})
const refreshKey = ref(0)

// ==================== 添加视频/图片到合集 ====================
const showAddItemsModal = ref(false)
const addItemsLoading = ref(false)
const allItems = ref<any[]>([])
const addItemsSelectedKeys = ref<number[]>([])
const addItemsPage = ref(1)
const addItemsPageSize = ref(20)
const addItemsTotalCount = ref(0)

const addItemsColumns = computed<DataTableColumns>(() => {
  const selectionCol = { type: 'selection' as const }
  if (collectionDetailStore.img) {
    return [
      selectionCol,
      { title: '文件名', key: 'fileName' },
      { title: '标题', key: 'title', render: (row: any) => row.title || '-' },
      { title: '描述', key: 'description', render: (row: any) => row.description || '-', ellipsis: { tooltip: true } }
    ]
  }
  return [
    selectionCol,
    { title: '标题', key: 'title', render: (row: any) => row.title || '-' },
    { title: '文件名', key: 'fileName' },
    { title: '合集', key: 'collections', render: (row: any) => row.collections?.length ? row.collections.map((c: any) => c.name).join(', ') : '-' },
    { title: '创建时间', key: 'createdAt', render: (row: any) => new Date(row.createdAt).toLocaleString('zh-CN') }
  ]
})

function openAddItemsModal() {
  addItemsSelectedKeys.value = []
  addItemsPage.value = 1
  showAddItemsModal.value = true
  fetchAllItems()
}

async function fetchAllItems() {
  addItemsLoading.value = true
  try {
    if (collectionDetailStore.img) {
      const res: any = await fetchImages({ page: addItemsPage.value, pageSize: addItemsPageSize.value })
      allItems.value = res.data || []
      addItemsTotalCount.value = res.total || 0
    } else {
      const res: any = await fetchVideoList({ page: addItemsPage.value, pageSize: addItemsPageSize.value, collectionId: 0 })
      allItems.value = res.data || []
      addItemsTotalCount.value = res.total || 0
    }
  } catch {
    message.error('加载数据失败')
  } finally {
    addItemsLoading.value = false
  }
}

function handleAddItemsPageSizeChange() {
  addItemsPage.value = 1
  fetchAllItems()
}

async function confirmAddItems() {
  if (addItemsSelectedKeys.value.length === 0) return
  try {
    if (collectionDetailStore.img) {
      await addImagesToCollections({
        imageIds: addItemsSelectedKeys.value,
        collectionIds: [id]
      })
    } else {
      await addVideosToCollections({
        videoIds: addItemsSelectedKeys.value,
        collectionIds: [id]
      })
    }
    message.success('添加成功')
    showAddItemsModal.value = false
    refreshKey.value++
  } catch {
    message.error('添加失败')
  }
}

async function saveCollection() {
  try {
    const params = {
      id: collection.value.id,
      name: collection.value.name,
      description: collection.value.description
    }
    if (collectionDetailStore.img) {
      await saveImageCollection(params)
    } else {
      await saveVideoCollection(params)
    }
    message.success('保存成功')
  } catch {
    message.error('保存失败')
  }
}

const showCoverModal = ref(false)

function chooseCover() {
  showCoverModal.value = true
}

function handleCoverSelected(image: ImageItem) {
  collection.value.imageUrl = image.imageUrl
  showCoverModal.value = false
  if (collectionDetailStore.img) {
    updateImageCollectionCover(collection.value.id, image.id)
  } else {
    updateVideoCollectionCover(collection.value.id, image.id)
  }
}

function goList() {
  router.push('/manager/collection')
}

onMounted(async () => {
  const res: any = collectionDetailStore.img
    ? await fetchImageCollectionWithCover(id)
    : await fetchCollectionWithCover(id)
  collection.value = res?.data ?? res
})

onBeforeMount(() => {
  const idParam = route.params.id
  const id = Array.isArray(idParam) ? parseInt(idParam[0], 10) : parseInt(idParam as any, 10)
  if (collectionDetailStore.img) {
    imageManagerStore.setCollection(isNaN(id) ? null : id)
  } else {
    collectionStore.setCollection(isNaN(id) ? null : id)
  }
})
</script>

<style scoped>
.detail-page {
  padding: 32px 40px;
  max-width: 1200px;
  margin: 0 auto;
}

/* 页头 */
.page-header {
  margin-bottom: 28px;
}

.back-btn {
  font-size: 13px;
  color: #999;
  margin-bottom: 12px;
}

.back-btn:hover {
  color: #555;
}

.header-title {
  display: flex;
  align-items: center;
}

.page-title {
  font-size: 24px;
  font-weight: 700;
  margin: 0;
  line-height: 1.3;
}

/* 合集信息卡片 */
.info-card {
  display: flex;
  gap: 32px;
  background: var(--n-card-color, #fff);
  border: 1px solid var(--n-border-color, #e8e8e8);
  border-radius: 12px;
  padding: 28px;
  margin-bottom: 24px;
  box-shadow: 0 1px 6px rgba(0,0,0,0.05);
}

/* 封面区域 */
.cover-section {
  flex: 0 0 240px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cover-frame {
  width: 240px;
  aspect-ratio: 16 / 10;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--n-border-color, #e8e8e8);
  background: #f5f5f5;
}

.cover-img {
  width: 100%;
  height: 100%;
  display: block;
}

.cover-empty {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: linear-gradient(135deg, #f8f8f8 0%, #eeeeee 100%);
}

.cover-empty-text {
  font-size: 12px;
  color: #bbb;
}

.meta-row {
  display: flex;
  align-items: center;
  gap: 5px;
}

/* 表单区域 */
.form-section {
  flex: 1;
  min-width: 0;
}

.section-label {
  font-size: 13px;
  font-weight: 600;
  color: #999;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 16px;
}

.form-actions {
  margin-top: 8px;
}

/* 媒体卡片 */
.media-card {
  background: var(--n-card-color, #fff);
  border: 1px solid var(--n-border-color, #e8e8e8);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 1px 6px rgba(0,0,0,0.05);
}

.media-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px;
  border-bottom: 1px solid var(--n-border-color, #e8e8e8);
}

.media-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.media-icon {
  color: #888;
}

.media-title {
  font-size: 16px;
  font-weight: 600;
}

.media-body {
  padding: 20px 24px;
}
</style>
