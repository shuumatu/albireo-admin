<template>
  <div class="detail-page admin-page">

    <!-- 返回 + 页面头 -->
    <div class="page-header">
      <n-button text @click="goList" class="back-btn">
        <template #icon><n-icon><ArrowLeft24Regular /></n-icon></template>
        合集管理
      </n-button>
      <div class="header-title">
        <h1 class="page-title">{{ collection.name || (detailLoading ? '正在加载合集…' : '合集详情') }}</h1>
        <n-tag size="small" :bordered="false" type="info" style="margin-left: 8px;">
          {{ collectionDetailStore.img ? '图片合集' : '视频合集' }}
        </n-tag>
        <span style="flex: 1 1 auto;" />
        <n-button
          v-if="collection.id"
          type="primary"
          ghost
          @click="openShareDialog"
          title="分享这个合集"
        >
          <template #icon>
            <svg viewBox="0 0 24 24" width="14" height="14">
              <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92S19.61 16.08 18 16.08z" fill="currentColor"/>
            </svg>
          </template>
          分享
        </n-button>
      </div>
    </div>

    <!-- 合集信息卡片：封面 + 表单 两栏布局 -->
    <n-alert v-if="detailError" type="error" :bordered="false" style="margin-bottom: 20px;">{{ detailError }} <n-button text type="error" @click="loadCollection">重新加载</n-button></n-alert>
    <n-skeleton v-if="detailLoading" height="360px" style="border-radius: 14px; margin-bottom: 24px;" />
    <div v-if="collection.id && !detailLoading" class="info-card">
      <!-- 左侧：封面 -->
      <div class="cover-section">
        <div class="cover-frame">
          <n-image
            v-if="collection.imageUrl"
            :src="imageForSize(collection.renditions, collection.imageUrl, 420, 320, 'cover', 2)"
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
        <n-button class="cover-btn" @click="chooseCover" block secondary :loading="coverSaving">
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
        <n-form :model="collection" label-placement="top" :disabled="saving">
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
          <n-form-item label="可见性">
            <n-radio-group v-model:value="collection.visibility">
              <n-radio-button value="private">私密</n-radio-button>
              <n-radio-button value="public">公开</n-radio-button>
            </n-radio-group>
          </n-form-item>
          <n-text depth="3">公开合集只展示其中已公开的媒体，不会改变成员的可见性。</n-text>
        </n-form>
        <div class="form-actions">
          <n-button type="primary" size="large" :loading="saving" @click="saveCollection">
            <template #icon><n-icon><Save24Regular /></n-icon></template>
            保存修改
          </n-button>
        </div>
      </div>
    </div>

    <!-- 媒体管理卡片 -->
    <div v-if="collection.id && !detailLoading" class="media-card">
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
    style="width: min(1100px, calc(100vw - 32px)); height: 80vh;"
    :mask-closable="false"
    :closable="!coverSaving"
    :close-on-esc="!coverSaving"
  >
    <n-spin :show="coverSaving" style="height: calc(80vh - 120px);">
      <CoverImageSelector @cover-selected="handleCoverSelected" />
    </n-spin>
  </n-modal>

  <!-- 添加视频/图片到合集弹窗：大图标网格 -->
  <n-modal
    v-model:show="showAddItemsModal"
    :title="'添加' + (collectionDetailStore.img ? '图片' : '视频') + '到合集'"
    preset="card"
    style="width: min(1280px, calc(100vw - 32px));"
    :mask-closable="false"
    :closable="!addingItems"
    :close-on-esc="!addingItems"
  >
    <!-- 工具栏：搜索 + 全选 + 计数 -->
    <div class="add-items-toolbar">
      <n-input
        v-model:value="addItemsKeyword"
        :placeholder="`搜索${collectionDetailStore.img ? '图片' : '视频'}标题 / 文件名`"
        clearable
        style="width: min(280px, 100%)"
        :disabled="addingItems"
        @keyup.enter="handleAddItemsSearch"
        @clear="handleAddItemsSearch"
      >
        <template #prefix><n-icon><Search24Regular /></n-icon></template>
      </n-input>
      <n-button secondary type="primary" :loading="addItemsLoading" :disabled="addingItems" @click="handleAddItemsSearch">搜索</n-button>
      <n-button
        size="small"
        :disabled="selectablePageItems.length === 0 || addItemsLoading || addingItems"
        @click="toggleSelectAllInPage"
      >
        {{ isAllPageSelected ? '取消本页全选' : '本页全选' }}
      </n-button>
      <div class="add-items-toolbar__right">
        <n-text depth="3">
          共 {{ addItemsTotalCount }} 项 · 已选 {{ addItemsSelectedKeys.length }}
        </n-text>
      </div>
    </div>

    <n-alert v-if="addItemsError" type="error" :bordered="false" style="margin-bottom: 16px;">{{ addItemsError }} <n-button text type="error" @click="fetchAllItems">重新加载</n-button></n-alert>
    <n-spin :show="addItemsLoading">
      <div class="add-items-grid-wrapper">
        <div v-if="!addItemsLoading && !addItemsError && allItems.length === 0" class="add-items-empty">
          <n-empty :description="`暂无${collectionDetailStore.img ? '图片' : '视频'}`" />
        </div>
        <div v-else class="add-items-grid">
          <div
            v-for="item in allItems"
            :key="item.id"
            :class="[
              'pick-card',
              {
                'pick-card--selected': addItemsSelectedKeys.includes(item.id),
                'pick-card--in-collection': isItemInCurrentCollection(item),
                'pick-card--video': !collectionDetailStore.img,
              },
            ]"
            @click="togglePickItem(item)"
            role="checkbox"
            :tabindex="isItemInCurrentCollection(item) || addingItems ? -1 : 0"
            :aria-checked="addItemsSelectedKeys.includes(item.id)"
            :aria-disabled="isItemInCurrentCollection(item) || addingItems"
            :aria-label="getItemTitle(item)"
            @keydown.enter.prevent="togglePickItem(item)"
            @keydown.space.prevent="togglePickItem(item)"
          >
            <div class="pick-card__cover">
              <MediaImage :renditions="item.renditions"
                v-if="getThumb(item)"
                :src="getThumb(item)!"
                :alt="getItemTitle(item)"
                class="pick-card__img"
                loading="lazy"
              />
              <div v-else class="pick-card__placeholder">
                <n-icon size="36" color="#bbb">
                  <component :is="collectionDetailStore.img ? Image24Regular : VideoClip24Regular" />
                </n-icon>
              </div>

              <!-- 选中遮罩 -->
              <div class="pick-card__check">
                <n-icon size="14"><Checkmark24Filled /></n-icon>
              </div>

              <!-- 已在合集中的角标 -->
              <div v-if="isItemInCurrentCollection(item)" class="pick-card__badge">
                已在合集
              </div>
            </div>

            <div class="pick-card__info">
              <div class="pick-card__title" :title="getItemTitle(item)">
                {{ getItemTitle(item) }}
              </div>
              <div class="pick-card__sub" :title="item.fileName">
                {{ item.fileName }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </n-spin>

    <n-flex justify="space-between" align="center" class="add-items-footer">
      <n-pagination
        v-model:page="addItemsPage"
        v-model:page-size="addItemsPageSize"
        :item-count="addItemsTotalCount"
        show-size-picker
        :page-sizes="[12, 24, 48]"
        :page-slot="5"
        :disabled="addingItems || addItemsLoading"
        @update:page="fetchAllItems"
        @update:page-size="handleAddItemsPageSizeChange"
      />
      <n-flex>
        <n-button :disabled="addingItems" @click="showAddItemsModal = false">取消</n-button>
        <n-button
          type="primary"
          @click="confirmAddItems"
          :disabled="addItemsSelectedKeys.length === 0"
          :loading="addingItems"
        >
          添加选中 ({{ addItemsSelectedKeys.length }})
        </n-button>
      </n-flex>
    </n-flex>
  </n-modal>

  <!-- 分享对话框 -->
  <ShareDialog
    v-model:show="shareDialogShow"
    :target="shareTarget"
  />
</template>

<script setup lang="ts">
import MediaImage from '../components/MediaImage.vue'
import { imageForSize } from '../utils/mediaQuality'

import { ref, computed, onBeforeMount, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
import dayjs from 'dayjs'
import VideoMetaManager from './VideoMetaManager.vue'
import ImageManager from './image/ImageListPage.vue'
import ShareDialog from '../components/share/ShareDialog.vue'
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
  Search24Regular,
  Checkmark24Filled,
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
const detailLoading = ref(true)
const detailError = ref('')
const saving = ref(false)
const coverSaving = ref(false)

// ==================== 分享 ====================
const shareDialogShow = ref(false)
const shareTarget = ref<{ targetType: 'collection'; targetId: number; name: string; coverUrl: string | null } | null>(null)

function openShareDialog() {
  if (!collection.value?.id) return
  shareTarget.value = {
    targetType: 'collection',
    targetId: collection.value.id,
    name: collection.value.name || `合集 #${collection.value.id}`,
    coverUrl: collection.value.imageUrl || null,
  }
  shareDialogShow.value = true
}

// ==================== 添加视频/图片到合集 ====================
const showAddItemsModal = ref(false)
const addItemsLoading = ref(false)
const addItemsError = ref('')
const addingItems = ref(false)
let itemsRequestId = 0
const allItems = ref<any[]>([])
const addItemsSelectedKeys = ref<number[]>([])
const addItemsPage = ref(1)
const addItemsPageSize = ref(24)
const addItemsTotalCount = ref(0)
const addItemsKeyword = ref('')

function openAddItemsModal() {
  addItemsSelectedKeys.value = []
  addItemsPage.value = 1
  addItemsKeyword.value = ''
  showAddItemsModal.value = true
  fetchAllItems()
}

async function fetchAllItems() {
  const current = ++itemsRequestId
  addItemsLoading.value = true
  addItemsError.value = ''
  try {
    if (collectionDetailStore.img) {
      // type 留空 = 不限类型；后端 `type` 为 null 时返回全量
      const res: any = await fetchImages({
        page: addItemsPage.value,
        pageSize: addItemsPageSize.value,
        keyword: addItemsKeyword.value || undefined,
      })
      if (current !== itemsRequestId) return
      allItems.value = res.data || []
      addItemsTotalCount.value = res.total || 0
    } else {
      const res: any = await fetchVideoList({
        page: addItemsPage.value,
        pageSize: addItemsPageSize.value,
        collectionId: 0,
        keyword: addItemsKeyword.value || undefined,
      })
      if (current !== itemsRequestId) return
      allItems.value = res.data || []
      addItemsTotalCount.value = res.total || 0
    }
  } catch {
    if (current === itemsRequestId) { allItems.value = []; addItemsTotalCount.value = 0; addItemsError.value = '媒体加载失败，请重试。' }
  } finally {
    if (current === itemsRequestId) addItemsLoading.value = false
  }
}

function handleAddItemsPageSizeChange() {
  addItemsPage.value = 1
  fetchAllItems()
}

function handleAddItemsSearch() {
  addItemsPage.value = 1
  fetchAllItems()
}

// 取缩略图：图片用 imageUrl；视频用 coverUrl
function getThumb(item: any): string | null {
  if (collectionDetailStore.img) return item.imageUrl || null
  return item.coverUrl || null
}

function getItemTitle(item: any): string {
  return item.title || item.fileName || `#${item.id}`
}

function isItemInCurrentCollection(item: any): boolean {
  if (!item?.collections || !Array.isArray(item.collections)) return false
  return item.collections.some((c: any) => Number(c.id) === id)
}

function togglePickItem(item: any) {
  if (isItemInCurrentCollection(item) || addingItems.value || addItemsLoading.value) return
  const idx = addItemsSelectedKeys.value.indexOf(item.id)
  if (idx >= 0) {
    addItemsSelectedKeys.value.splice(idx, 1)
  } else {
    addItemsSelectedKeys.value.push(item.id)
  }
}

// 当前页可被选中（即未在当前合集中）的项
const selectablePageItems = computed(() =>
  allItems.value.filter((item) => !isItemInCurrentCollection(item))
)

const isAllPageSelected = computed(() => {
  if (selectablePageItems.value.length === 0) return false
  return selectablePageItems.value.every((item) =>
    addItemsSelectedKeys.value.includes(item.id)
  )
})

function toggleSelectAllInPage() {
  if (isAllPageSelected.value) {
    const removeIds = new Set(selectablePageItems.value.map((it) => it.id))
    addItemsSelectedKeys.value = addItemsSelectedKeys.value.filter(
      (k) => !removeIds.has(k)
    )
  } else {
    const next = new Set(addItemsSelectedKeys.value)
    for (const it of selectablePageItems.value) next.add(it.id)
    addItemsSelectedKeys.value = Array.from(next)
  }
}

async function confirmAddItems() {
  if (addItemsSelectedKeys.value.length === 0 || addingItems.value) return
  addingItems.value = true
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
  } finally {
    addingItems.value = false
  }
}

async function saveCollection() {
  if (saving.value || !collection.value.id) return
  if (!collection.value.name?.trim()) { message.warning('请输入合集名称'); return }
  saving.value = true
  try {
    const params = {
      id: collection.value.id,
      name: collection.value.name.trim(),
      description: collection.value.description,
      visibility: collection.value.visibility ?? 'private'
    }
    if (collectionDetailStore.img) {
      await saveImageCollection(params)
    } else {
      await saveVideoCollection(params)
    }
    message.success('保存成功')
  } catch {
    message.error('保存失败')
  } finally {
    saving.value = false
  }
}

const showCoverModal = ref(false)

function chooseCover() {
  showCoverModal.value = true
}

async function handleCoverSelected(image: ImageItem) {
  if (coverSaving.value) return
  coverSaving.value = true
  try {
    if (collectionDetailStore.img) await updateImageCollectionCover(collection.value.id, image.id)
    else await updateVideoCollectionCover(collection.value.id, image.id)
    collection.value.imageUrl = image.imageUrl
    showCoverModal.value = false
    message.success('封面已更新')
  } catch { message.error('封面更新失败，请重试') }
  finally { coverSaving.value = false }
}

function goList() {
  router.push('/manager/collection')
}

async function loadCollection() {
  detailLoading.value = true
  detailError.value = ''
  try {
    if (!Number.isFinite(id) || id <= 0) throw new Error('invalid id')
    const res: any = collectionDetailStore.img ? await fetchImageCollectionWithCover(id) : await fetchCollectionWithCover(id)
    const data = res?.data ?? res
    if (!data?.id) throw new Error('not found')
    collection.value = { ...data, visibility: data.visibility ?? 'private' }
  } catch { detailError.value = '无法加载该合集，它可能已被删除或暂时无法访问。' }
  finally { detailLoading.value = false }
}
onMounted(loadCollection)

onBeforeMount(() => {
  if (route.query.type === 'image' || route.query.type === 'video') collectionDetailStore.img = route.query.type === 'image'
  const idParam = route.params.id
  const id = Array.isArray(idParam) ? parseInt(idParam[0], 10) : parseInt(idParam as any, 10)
  if (collectionDetailStore.img) {
    imageManagerStore.setCollection(isNaN(id) ? null : id)
  } else {
    collectionStore.setCollection(isNaN(id) ? null : id)
  }
})
onBeforeUnmount(() => { itemsRequestId++; imageManagerStore.setCollection(null); collectionStore.setCollection(null) })
</script>

<style scoped>
.detail-page {
  width: 100%;
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
  flex-wrap: wrap;
  gap: 8px;
}

.page-title {
  font-size: 24px;
  font-weight: 700;
  margin: 0;
  line-height: 1.3;
  overflow-wrap: anywhere;
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

/* ===== 添加图片/视频弹窗：网格 ===== */
.add-items-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}

.add-items-toolbar__right {
  margin-left: auto;
}

.add-items-grid-wrapper {
  min-height: 320px;
  max-height: 62vh;
  overflow-y: auto;
  padding-right: 4px;
}

.add-items-empty {
  padding: 60px 0;
  display: flex;
  justify-content: center;
}

/*
  网格密度：图片用更小的方格（1:1），视频比例宽（16:9）。
  通过 .pick-card--video 切换 aspect-ratio 即可，不必拆两套布局。
*/
.add-items-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
  gap: 14px;
}

.pick-card {
  position: relative;
  cursor: pointer;
  border-radius: 10px;
  overflow: hidden;
  background: var(--n-card-color, #fff);
  border: 2px solid transparent;
  transition: border-color 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease;
  user-select: none;
}

.pick-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.1);
}

.pick-card--selected {
  border-color: var(--n-primary-color, #18a058);
  box-shadow: 0 6px 18px rgba(24, 160, 88, 0.18);
}

.pick-card--in-collection {
  opacity: 0.78;
  cursor: not-allowed;
}
.pick-card--in-collection:hover {
  opacity: 1;
}

.pick-card__cover {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  background: linear-gradient(135deg, #f5f5f5 0%, #ebebeb 100%);
  overflow: hidden;
}

.pick-card--video .pick-card__cover {
  aspect-ratio: 16 / 10;
}

:deep(.pick-card__img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.pick-card__placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pick-card__check {
  position: absolute;
  top: 8px;
  left: 8px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  border: 1.5px solid rgba(0, 0, 0, 0.18);
  color: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.pick-card--selected .pick-card__check {
  background: var(--n-primary-color, #18a058);
  border-color: var(--n-primary-color, #18a058);
  color: #fff;
}

.pick-card__badge {
  position: absolute;
  bottom: 8px;
  right: 8px;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  backdrop-filter: blur(4px);
  pointer-events: none;
}

.pick-card__info {
  padding: 8px 10px 10px;
}

.pick-card__title {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: inherit;
}

.pick-card__sub {
  margin-top: 2px;
  font-size: 11px;
  color: #999;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pick-card:focus-visible { outline: 3px solid var(--admin-accent, #2f7b5b); outline-offset: 2px; }
.add-items-footer { margin-top: 16px; gap: 16px; }
.add-items-footer :deep(.n-pagination) { max-width: 100%; overflow-x: auto; }
.media-body :deep(.admin-page) { padding: 0; }
@media (max-width: 760px) { .info-card { flex-direction: column; gap: 20px; padding: 18px; }.cover-section { flex-basis: auto; }.cover-frame { width: 100%; max-width: 420px; }.media-header { padding: 16px; gap: 12px; flex-wrap: wrap; }.media-body { padding: 16px; }.add-items-toolbar__right { width: 100%; margin-left: 0; }.add-items-grid { grid-template-columns: repeat(auto-fill, minmax(125px, 1fr)); gap: 10px; }.add-items-grid-wrapper { min-height: 200px; max-height: 50vh; } }
@media (prefers-reduced-motion: reduce) { .pick-card, .pick-card__check { transition: none; }.pick-card:hover { transform: none; } }
</style>
