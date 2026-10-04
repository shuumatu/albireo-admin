<template>
  <div class="collection-page admin-page">
    <!-- 页面头部 -->
    <div class="page-header admin-page-header">
      <div class="header-left">
        <h1 class="page-title">合集管理</h1>
        <p class="page-subtitle">将{{ img ? '图片' : '视频' }}归入合集，集中整理、编辑与分享。</p>
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
    <div class="toolbar admin-panel admin-toolbar">
      <n-input
        v-model:value="searchKeyword"
        placeholder="搜索合集名称..."
        style="width: min(280px, 100%)"
        aria-label="搜索合集名称"
        clearable
        @keyup.enter="handleSearch"
        @clear="handleSearch"
      >
        <template #prefix>
          <n-icon><Search24Regular /></n-icon>
        </template>
      </n-input>
      <n-button type="primary" secondary :loading="loading" @click="handleSearch">搜索</n-button>
      <n-button v-if="appliedKeyword" @click="resetSearch">重置</n-button>
      <n-button :disabled="loading" @click="fetchCollectionData">刷新</n-button>
      <n-button type="primary" @click="handleAddCollection">
        <template #icon><n-icon><Add24Filled /></n-icon></template>
        新建合集
      </n-button>

      <div class="toolbar-right">
        <n-text depth="3" aria-live="polite">{{ appliedKeyword ? '搜索结果' : '全部合集' }} · {{ total }} 个</n-text>
      </div>
    </div>

    <!-- 合集网格 -->
    <n-alert v-if="loadError" type="error" :bordered="false" style="margin-bottom: 20px;">{{ loadError }} <n-button text type="error" @click="fetchCollectionData">重新加载</n-button></n-alert>
    <n-spin :show="loading">
      <div v-if="loading && collections.length === 0" class="grid" aria-label="正在加载合集"><n-skeleton v-for="n in 6" :key="n" height="230px" style="border-radius: 14px;" /></div>
      <div v-else-if="!loadError && collections.length === 0" class="empty-state admin-panel">
        <n-icon size="64" color="#ccc" class="mb-3">
          <FolderOpen24Regular />
        </n-icon>
        <p class="empty-title">{{ appliedKeyword ? '没有找到匹配的合集' : '还没有合集' }}</p>
        <p class="empty-desc">{{ appliedKeyword ? '试试其他关键词，或清除搜索查看全部合集' : '按主题整理媒体，从第一个合集开始' }}</p>
        <n-button v-if="appliedKeyword" class="mt-4" @click="resetSearch">清除搜索</n-button>
        <n-button v-else type="primary" class="mt-4" @click="handleAddCollection">
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
          tabindex="0"
          :aria-label="`查看合集：${item.name}`"
          @keydown.enter.self.prevent="goDetail(item.id)"
          @keydown.space.self.prevent="goDetail(item.id)"
        >
          <!-- 封面 -->
          <div class="card-cover">
            <img
              v-if="item.coverUrl"
              :src="item.coverUrl"
              :alt="item.name"
              loading="lazy"
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
              <n-button
                size="small"
                type="primary"
                class="overlay-btn"
                @click.stop="openShareDialog(item)"
              >
                分享
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
                    :loading="deletingIds.has(item.id)"
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
    <div class="pagination-wrapper admin-pagination" v-if="total > 0">
      <n-pagination
        v-model:page="currentPage"
        :page-size="pageSize"
        :item-count="total"
        :page-sizes="[12, 24, 48]"
        show-size-picker
        :page-slot="5"
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
    style="width: min(480px, calc(100vw - 32px));"
    :mask-closable="!submitting"
    :close-on-esc="!submitting"
    :closable="!submitting"
    @after-leave="handleClose"
  >
    <n-form :model="collectionData" label-placement="top" :disabled="submitting">
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
        <n-button :disabled="submitting" @click="showAddCollectionModal = false">取消</n-button>
        <n-button type="primary" :loading="submitting" @click="handleSubmit">创建</n-button>
      </n-flex>
    </template>
  </n-modal>

  <!-- 分享对话框 -->
  <ShareDialog
    v-model:show="shareDialogShow"
    :target="shareTarget"
  />
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
import ShareDialog from '../components/share/ShareDialog.vue'

const collectionDetailStore = useCollectionDetailStore()
const message = useMessage()
const router = useRouter()

// ---------- 分享 ----------
const shareDialogShow = ref(false)
const shareTarget = ref<{ targetType: 'collection'; targetId: number; name: string; coverUrl: string | null } | null>(null)

function openShareDialog(item: any) {
  shareTarget.value = {
    targetType: 'collection',
    targetId: item.id,
    name: item.name || `合集 #${item.id}`,
    coverUrl: item.coverUrl || null,
  }
  shareDialogShow.value = true
}

const searchKeyword = ref('')
const appliedKeyword = ref('')
const loadError = ref('')
const deletingIds = ref(new Set<number>())
let requestId = 0
const collections = ref<any[]>([])
const loading = ref(false)
const submitting = ref(false)
const img = ref(collectionDetailStore.img === true)
const currentPage = ref(1)
const pageSize = ref(12)
const total = ref(0)

const showAddCollectionModal = ref(false)
const collectionData = ref({ name: '', description: '' })

const fetchCollectionData = async () => {
  const current = ++requestId
  loading.value = true
  loadError.value = ''
  try {
    const params = {
      page: currentPage.value,
      pageSize: pageSize.value,
      keyword: appliedKeyword.value || undefined,
    }
    const response: any = img.value
      ? await fetchImageCollections(params)
      : await fetchCollections(params)
    if (current !== requestId) return

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
    const lastPage = Math.max(1, Math.ceil(total.value / pageSize.value))
    if (currentPage.value > lastPage) { currentPage.value = lastPage; await fetchCollectionData() }
  } catch (error) {
    if (current === requestId) { collections.value = []; total.value = 0; loadError.value = '合集加载失败，请稍后重试。' }
  } finally {
    if (current === requestId) loading.value = false
  }
}

const handleSearch = () => {
  appliedKeyword.value = searchKeyword.value.trim()
  currentPage.value = 1
  fetchCollectionData()
}

const resetSearch = () => { searchKeyword.value = ''; handleSearch() }

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
  appliedKeyword.value = ''
  collections.value = []
  fetchCollectionData()
}

const goDetail = (id: number) => {
  collectionDetailStore.img = img.value
  router.push({ path: `/manager/collection/${id}`, query: { type: img.value ? 'image' : 'video' } })
}

const handleAddCollection = () => {
  showAddCollectionModal.value = true
}

const handleClose = () => {
  collectionData.value = { name: '', description: '' }
}

const handleSubmit = async () => {
  if (submitting.value) return
  if (!collectionData.value.name.trim()) {
    message.warning('请输入合集名称')
    return
  }
  submitting.value = true
  try {
    const payload = { name: collectionData.value.name.trim(), description: collectionData.value.description.trim() }
    if (img.value) {
      await addImageCollection(payload)
    } else {
      await addVideoCollection(payload)
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
  if (deletingIds.value.has(id)) return false
  deletingIds.value.add(id)
  try {
    await deleteCollection(id)
    message.success('删除成功')
    if (collections.value.length === 1 && currentPage.value > 1) {
      currentPage.value--
    }
    await fetchCollectionData()
  } catch (err) {
    console.error(err)
    message.error('删除失败')
    return false
  } finally {
    deletingIds.value.delete(id)
  }
}

onMounted(() => {
  collectionDetailStore.img = img.value
  fetchCollectionData()
})
</script>

<style scoped>
.collection-page {
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
  border-radius: 14px;
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

.collection-card:hover .card-overlay,
.collection-card:focus-within .card-overlay {
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
  inset: auto 0 0;
  padding: 12px 4px;
  background: linear-gradient(transparent, rgba(17, 27, 50, 0.7));
  opacity: 1;
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
  top: 8px;
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
.collection-card:focus-visible { outline: 3px solid var(--admin-accent, #2f7b5b); outline-offset: 3px; }
@media (max-width: 640px) { .page-header { align-items: flex-start; gap: 16px; flex-direction: column; }.grid { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 14px; }.toolbar-right { width: 100%; margin-left: 0; }.pagination-wrapper { justify-content: flex-start; overflow-x: auto; } }
@media (prefers-reduced-motion: reduce) { .collection-card, .cover-img, .card-overlay { transition: none; }.collection-card:hover, .collection-card:hover .cover-img { transform: none; } }
</style>
