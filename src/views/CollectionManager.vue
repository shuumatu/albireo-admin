<template>
  <div class="collection-page">
    <!-- 页面头部 -->
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">合集管理</h1>
        <p class="page-subtitle">管理你的{{ img ? '图片' : '视频' }}合集</p>
      </div>
      <div class="header-right">
        <n-button-group>
          <n-button
            :type="!img ? 'primary' : 'default'"
            @click="setType(false)"
          >
            <template #icon><n-icon><VideoClip24Regular /></n-icon></template>
            视频合集
          </n-button>
          <n-button
            :type="img ? 'primary' : 'default'"
            @click="setType(true)"
          >
            <template #icon><n-icon><Image24Regular /></n-icon></template>
            图片合集
          </n-button>
        </n-button-group>
      </div>
    </div>

    <!-- 搜索 & 操作栏 -->
    <div class="toolbar">
      <n-input
        v-model:value="searchKeyword"
        placeholder="搜索合集名称..."
        style="width: 280px"
        clearable
        @keyup.enter="handleSearch"
        @clear="handleSearch"
      >
        <template #prefix>
          <n-icon><Search24Regular /></n-icon>
        </template>
      </n-input>
      <n-button type="primary" ghost @click="handleSearch">搜索</n-button>
      <n-button type="primary" @click="handleAddCollection">
        <template #icon><n-icon><Add24Filled /></n-icon></template>
        新建合集
      </n-button>

      <div class="toolbar-right">
        <n-text depth="3" v-if="total > 0">共 {{ total }} 个合集</n-text>
      </div>
    </div>

    <!-- 合集网格 -->
    <n-spin :show="loading">
      <div v-if="!loading && collections.length === 0" class="empty-state">
        <n-icon size="64" color="#ccc" class="mb-3">
          <FolderOpen24Regular />
        </n-icon>
        <p class="empty-title">暂无合集</p>
        <p class="empty-desc">点击「新建合集」创建你的第一个合集</p>
        <n-button type="primary" class="mt-4" @click="handleAddCollection">
          <template #icon><n-icon><Add24Filled /></n-icon></template>
          新建合集
        </n-button>
      </div>

      <div v-else class="grid">
        <div
          v-for="item in collections"
          :key="item.id"
          class="collection-card"
          @click="goDetail(item.id)"
        >
          <!-- 封面 -->
          <div class="card-cover">
            <img
              v-if="item.coverUrl"
              :src="item.coverUrl"
              class="cover-img"
            />
            <div v-else class="cover-placeholder">
              <n-icon size="40" color="#bbb">
                <component :is="img ? Image24Regular : VideoClip24Regular" />
              </n-icon>
            </div>

            <!-- Hover 遮罩 -->
            <div class="card-overlay">
              <n-button
                size="small"
                secondary
                type="default"
                class="overlay-btn"
                @click.stop="goDetail(item.id)"
              >
                查看详情
              </n-button>
              <n-popconfirm
                @positive-click="handleDelete(item.id)"
                negative-text="取消"
                positive-text="删除"
                @click.stop
              >
                <template #trigger>
                  <n-button
                    size="small"
                    type="error"
                    class="overlay-btn"
                    @click.stop
                  >
                    删除
                  </n-button>
                </template>
                确定删除合集「{{ item.name }}」吗？
              </n-popconfirm>
            </div>

            <!-- 计数角标 -->
            <div class="count-badge">
              <n-icon size="12"><component :is="img ? Image24Regular : VideoClip24Regular" /></n-icon>
              {{ item.videoCount ?? item.imageCount ?? 0 }}
            </div>
          </div>

          <!-- 卡片底部信息 -->
          <div class="card-info">
            <span class="card-name" :title="item.name">{{ item.name }}</span>
            <n-text depth="3" class="card-count">{{ img ? '图片' : '视频' }}数：{{ item.videoCount ?? item.imageCount ?? 0 }}</n-text>
          </div>
        </div>
      </div>
    </n-spin>

    <!-- 分页 -->
    <div class="pagination-wrapper" v-if="total > pageSize">
      <n-pagination
        v-model:page="currentPage"
        :page-size="pageSize"
        :item-count="total"
        :page-sizes="[12, 24, 48]"
        show-size-picker
        @update:page="fetchCollectionData"
        @update:page-size="handlePageSizeChange"
      />
    </div>
  </div>

  <!-- 新建合集弹窗 -->
  <n-modal
    v-model:show="showAddCollectionModal"
    preset="card"
    :title="img ? '新建图片合集' : '新建视频合集'"
    style="width: 480px;"
    @after-leave="handleClose"
  >
    <n-form :model="collectionData" label-width="80">
      <n-form-item label="名称" required>
        <n-input
          v-model:value="collectionData.name"
          placeholder="请输入合集名称"
          @keyup.enter="handleSubmit"
        />
      </n-form-item>
      <n-form-item label="描述">
        <n-input
          v-model:value="collectionData.description"
          type="textarea"
          placeholder="请输入描述（可选）"
          :rows="3"
        />
      </n-form-item>
    </n-form>
    <template #footer>
      <n-flex justify="flex-end">
        <n-button @click="showAddCollectionModal = false">取消</n-button>
        <n-button type="primary" :loading="submitting" @click="handleSubmit">创建</n-button>
      </n-flex>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
import { addImageCollection, addVideoCollection, fetchCollections, fetchImageCollections } from '../api/manager'
import { deleteCollection } from '../api/collection'
import {
  Image24Regular,
  VideoClip24Regular,
  Add24Filled,
  Search24Regular,
  FolderOpen24Regular,
} from '@vicons/fluent'
import { useCollectionDetailStore } from '../stores/collection'

const collectionDetailStore = useCollectionDetailStore()
const message = useMessage()
const router = useRouter()

const searchKeyword = ref('')
const collections = ref<any[]>([])
const loading = ref(false)
const submitting = ref(false)
const img = ref(false)
const currentPage = ref(1)
const pageSize = ref(12)
const total = ref(0)

const showAddCollectionModal = ref(false)
const collectionData = ref({ name: '', description: '' })

const fetchCollectionData = async () => {
  loading.value = true
  try {
    const params = {
      page: currentPage.value,
      pageSize: pageSize.value,
      keyword: searchKeyword.value || undefined,
    }
    const response: any = img.value
      ? await fetchImageCollections(params)
      : await fetchCollections(params)

    if (response && Array.isArray(response.records)) {
      collections.value = response.records
      total.value = response.total ?? response.records.length
    } else if (response && Array.isArray(response.data)) {
      collections.value = response.data
      total.value = response.total ?? response.data.length
    } else if (Array.isArray(response)) {
      collections.value = response
      total.value = response.length
    } else {
      collections.value = []
      total.value = 0
    }
  } catch (error) {
    console.error('获取合集数据失败:', error)
    message.error('获取合集数据失败')
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  currentPage.value = 1
  fetchCollectionData()
}

const handlePageSizeChange = (size: number) => {
  pageSize.value = size
  currentPage.value = 1
  fetchCollectionData()
}

const setType = (isImg: boolean) => {
  if (img.value === isImg) return
  img.value = isImg
  collectionDetailStore.img = isImg
  currentPage.value = 1
  searchKeyword.value = ''
  fetchCollectionData()
}

const goDetail = (id: number) => {
  router.push(`/manager/collection/${id}`)
}

const handleAddCollection = () => {
  showAddCollectionModal.value = true
}

const handleClose = () => {
  collectionData.value = { name: '', description: '' }
}

const handleSubmit = async () => {
  if (!collectionData.value.name.trim()) {
    message.warning('请输入合集名称')
    return
  }
  submitting.value = true
  try {
    if (img.value) {
      await addImageCollection(collectionData.value)
    } else {
      await addVideoCollection(collectionData.value)
    }
    showAddCollectionModal.value = false
    message.success('创建成功')
    currentPage.value = 1
    fetchCollectionData()
  } catch (err) {
    console.error(err)
    message.error('创建失败')
  } finally {
    submitting.value = false
  }
}

const handleDelete = async (id: number) => {
  try {
    await deleteCollection(id)
    message.success('删除成功')
    if (collections.value.length === 1 && currentPage.value > 1) {
      currentPage.value--
    }
    fetchCollectionData()
  } catch (err) {
    console.error(err)
    message.error('删除失败')
  }
}

onMounted(() => {
  collectionDetailStore.img = img.value
  fetchCollectionData()
})
</script>

<style scoped>
.collection-page {
  padding: 32px 40px;
  min-height: 100%;
}

/* 页面头部 */
.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 28px;
}

.page-title {
  font-size: 26px;
  font-weight: 700;
  margin: 0 0 4px 0;
  color: inherit;
}

.page-subtitle {
  margin: 0;
  font-size: 13px;
  color: #999;
}

/* 工具栏 */
.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}

.toolbar-right {
  margin-left: auto;
}

/* 网格 */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 20px;
}

/* 卡片 */
.collection-card {
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  background: var(--n-card-color, #fff);
  border: 1px solid var(--n-border-color, #e8e8e8);
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}

.collection-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
}

.collection-card:hover .card-overlay {
  opacity: 1;
}

/* 封面区域 */
.card-cover {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 10;
  overflow: hidden;
  background-color: #f0f0f0;
}

.cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.3s ease;
}

.collection-card:hover .cover-img {
  transform: scale(1.04);
}

.cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f5f5f5 0%, #ebebeb 100%);
}

/* 悬浮遮罩 */
.card-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  opacity: 0;
  transition: opacity 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.overlay-btn {
  backdrop-filter: blur(4px);
}

/* 计数角标 */
.count-badge {
  position: absolute;
  bottom: 8px;
  right: 8px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  gap: 4px;
  backdrop-filter: blur(4px);
  pointer-events: none;
}

/* 卡片底部信息 */
.card-info {
  padding: 10px 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.card-name {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: inherit;
}

.card-count {
  font-size: 12px;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  text-align: center;
}

.empty-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 6px;
  color: #555;
}

.empty-desc {
  font-size: 13px;
  color: #aaa;
  margin: 0;
}

.mb-3 { margin-bottom: 12px; }
.mt-4 { margin-top: 16px; }

/* 分页 */
.pagination-wrapper {
  display: flex;
  justify-content: center;
  margin-top: 32px;
  padding-bottom: 16px;
}
</style>
