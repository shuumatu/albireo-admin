<template>
  <n-flex vertical style="padding: 0 32px;">
    <!-- 标题栏：标题 + 可见性筛选 + 视图切换 -->
    <n-flex justify="space-between" align="center" class="mb-4" style="width: 100%;">
      <n-flex align="center">
        <h2 style="margin: 0;">视频管理</h2>
      </n-flex>
      <n-flex justify="flex-end" align="center" :wrap="false">
        <!-- TODO: backend filter — 当前仅前端按当前页可见性过滤 -->
        <n-select
          v-model:value="visibilityFilter"
          clearable
          placeholder="全部可见性"
          style="width: 140px;"
          :options="visibilityFilterOptions"
        />
        <n-tooltip trigger="hover">
          <template #trigger>
            <n-button @click="toggleView">
              <n-icon v-if="viewMode === 'list'" :component="GridOutline" size="22" />
              <n-icon v-else :component="List20Filled" size="22" />
            </n-button>
          </template>
          {{ viewMode === 'list' ? '切换到大图标视图' : '切换到列表视图' }}
        </n-tooltip>
      </n-flex>
    </n-flex>

    <!-- 工具栏：默认模式 -->
    <n-flex align="center" v-if="!isDeleting && !isCollection">
      <n-button type="error" @click="startDelete">批量删除</n-button>
      <n-button strong secondary type="info" @click="startCollection">添加到合集</n-button>
    </n-flex>

    <!-- 工具栏：删除模式 -->
    <n-flex align="center" v-if="isDeleting">
      <n-popconfirm
        positive-text="是"
        negative-text="否"
        @positive-click="confirmDelete"
      >
        <template #trigger>
          <n-button type="error" :disabled="selectedKeys.length === 0">
            确认删除
          </n-button>
        </template>
        是否删除选中的 {{ selectedKeys.length }} 个视频？
      </n-popconfirm>
      <n-button @click="cancelDeleteMode">取消删除</n-button>
      <n-button @click="selectAllCurrentPage" :disabled="filteredVideoList.length === 0">
        全选
      </n-button>
      <n-button @click="clearAllSelection" :disabled="selectedKeys.length === 0">
        取消全选
      </n-button>
    </n-flex>

    <!-- 工具栏：加合集模式 -->
    <n-flex
      v-if="isCollection"
      class="collection-area"
      justify="space-between"
      align="center"
    >
      <n-flex align="center" style="margin-left: 16px;">
        <n-button @click="addCollection">加入合集</n-button>
        <n-button @click="selectAllCurrentPage" :disabled="filteredVideoList.length === 0">
          全选
        </n-button>
        <n-button @click="clearAllSelection" :disabled="selectedKeys.length === 0">
          取消全选
        </n-button>
        <span class="collection-area__hint">选择要加入合集的视频</span>
      </n-flex>
      <n-flex justify="flex-end" align="center" style="margin-right: 16px;">
        <n-button text @click="cancelCollectionMode">
          <n-icon size="20"><CloseOutline /></n-icon>
        </n-button>
      </n-flex>
    </n-flex>

    <!-- 列表视图 -->
    <n-data-table
      v-if="viewMode === 'list'"
      remote
      :columns="columns"
      :data="filteredVideoList"
      :bordered="false"
      :row-key="(row: VideoItem) => row.id"
      :checked-row-keys="selectedKeys"
      @update:checked-row-keys="handleSelectionChange"
      :loading="loading"
      :row-props="rowProps"
    />

    <!-- 大图标视图：批量 / 加合集模式（启用拖选） -->
    <drag-select
      v-else-if="isDeleting || isCollection"
      v-model="selectedKeys"
      multiple
      :clickOptionToSelect="true"
      :toggleKey="['ctrlKey', 'metaKey']"
      :rangeKey="['shiftKey']"
      background="rgba(60, 213, 111, 0.1)"
    >
      <n-grid cols="4" x-gap="16" y-gap="16">
        <n-grid-item v-for="video in filteredVideoList" :key="video.id">
          <drag-select-option :value="video.id">
            <div class="video-card-wrapper">
              <n-card
                size="small"
                hoverable
                :class="{ 'selected-card': isCardSelected(video.id) }"
                @click="handleCardClick(video, $event)"
              >
                <n-flex vertical>
                  <div class="cover-container">
                    <img
                      v-if="video.coverUrl"
                      :src="video.coverUrl"
                      class="cover-image"
                      loading="lazy"
                      @error="onCoverError"
                    />
                    <div v-else class="cover-placeholder">
                      <n-icon :component="VideocamOutline" size="40" />
                      <span class="cover-placeholder__ext">{{ getExt(video.fileName) }}</span>
                    </div>

                    <!-- 状态遮罩 -->
                    <div
                      v-if="video.status && video.status !== 'done'"
                      :class="['status-overlay', `status-${video.status}`]"
                    >
                      <n-flex vertical align="center" justify="center" style="height: 100%;">
                        <n-spin
                          v-if="isProcessingStatus(video.status)"
                          size="medium"
                        />
                        <span class="status-text">{{ getStatusText(video.status) }}</span>
                        <n-button
                          v-if="video.status === 'failed'"
                          type="error"
                          size="small"
                          @click.stop="handleRetry(video.id)"
                        >
                          重试
                        </n-button>
                      </n-flex>
                    </div>
                  </div>

                  <n-ellipsis :line-clamp="1" :tooltip="{ width: 240 }" class="card-title">
                    {{ video.title || video.fileName }}
                  </n-ellipsis>
                  <n-flex justify="space-between" align="center" class="card-meta">
                    <n-tag
                      v-if="video.visibility"
                      size="tiny"
                      :type="visibilityTagType(video.visibility)"
                      :bordered="false"
                    >
                      {{ visibilityText(video.visibility) }}
                    </n-tag>
                    <span v-else></span>
                    <n-tooltip>
                      <template #trigger>
                        <span class="card-meta__time">{{ formatRelative(video.createdAt) }}</span>
                      </template>
                      {{ new Date(video.createdAt).toLocaleString('zh-CN') }}
                    </n-tooltip>
                  </n-flex>
                </n-flex>
              </n-card>
            </div>
          </drag-select-option>
        </n-grid-item>
      </n-grid>
    </drag-select>

    <!-- 大图标视图：普通模式（hover 播放按钮 + 操作菜单） -->
    <n-grid v-else-if="viewMode === 'grid'" cols="4" x-gap="16" y-gap="16">
      <n-grid-item v-for="video in filteredVideoList" :key="video.id">
        <div class="video-card-wrapper">
          <n-card size="small" hoverable @click="openEditModal(video)">
            <n-flex vertical>
              <div class="cover-container">
                <img
                  v-if="video.coverUrl"
                  :src="video.coverUrl"
                  class="cover-image"
                  loading="lazy"
                  @error="onCoverError"
                />
                <div v-else class="cover-placeholder">
                  <n-icon :component="VideocamOutline" size="40" />
                  <span class="cover-placeholder__ext">{{ getExt(video.fileName) }}</span>
                </div>

                <!-- 播放按钮浮层（hover 显示，点击 = 打开公共站详情页） -->
                <button
                  v-if="!video.status || video.status === 'done'"
                  type="button"
                  class="play-overlay"
                  aria-label="播放视频"
                  @click.stop="openVideo(video)"
                >
                  <n-icon :component="PlayCircleOutline" size="44" />
                </button>

                <!-- 状态遮罩 -->
                <div
                  v-if="video.status && video.status !== 'done'"
                  :class="['status-overlay', `status-${video.status}`]"
                >
                  <n-flex vertical align="center" justify="center" style="height: 100%;">
                    <n-spin v-if="isProcessingStatus(video.status)" size="medium" />
                    <span class="status-text">{{ getStatusText(video.status) }}</span>
                    <n-button
                      v-if="video.status === 'failed'"
                      type="error"
                      size="small"
                      @click.stop="handleRetry(video.id)"
                    >
                      重试
                    </n-button>
                  </n-flex>
                </div>
              </div>

              <n-ellipsis :line-clamp="1" :tooltip="{ width: 240 }" class="card-title">
                {{ video.title || video.fileName }}
              </n-ellipsis>
              <n-flex justify="space-between" align="center" class="card-meta">
                <n-tag
                  v-if="video.visibility"
                  size="tiny"
                  :type="visibilityTagType(video.visibility)"
                  :bordered="false"
                >
                  {{ visibilityText(video.visibility) }}
                </n-tag>
                <span v-else></span>
                <n-tooltip>
                  <template #trigger>
                    <span class="card-meta__time">{{ formatRelative(video.createdAt) }}</span>
                  </template>
                  {{ new Date(video.createdAt).toLocaleString('zh-CN') }}
                </n-tooltip>
              </n-flex>
            </n-flex>
          </n-card>

          <div class="card-action-trigger" @click.stop>
            <n-dropdown
              trigger="click"
              :options="getCardActions(video)"
              @select="(key: string) => handleCardAction(key, video)"
              placement="bottom-end"
            >
              <n-button text size="small">
                <n-icon size="18"><EllipsisVertical /></n-icon>
              </n-button>
            </n-dropdown>
          </div>
        </div>
      </n-grid-item>
    </n-grid>

    <!-- 空状态 -->
    <n-empty
      v-if="!loading && filteredVideoList.length === 0"
      description="还没有视频，去上传一个吧"
      style="margin: 48px 0;"
    >
      <template #extra>
        <n-button type="primary" @click="goUpload">前往上传</n-button>
      </template>
    </n-empty>

    <!-- 分页 -->
    <n-flex justify="flex-end" style="width: 100%;">
      <n-pagination
        v-model:page="currentPage"
        v-model:page-size="pageSize"
        :item-count="total"
        show-size-picker
        :page-sizes="[10, 20, 50, 100]"
        @update:page="loadVideoList"
        @update:page-size="onPageSizeChange"
      />
    </n-flex>

    <!-- 编辑弹窗 -->
    <n-modal
      v-model:show="showModal"
      title="视频元数据"
      preset="card"
      style="width: 60vw;"
      :mask-closable="false"
      :draggable="{ bounds: 'none' }"
    >
      <n-form :model="form" :rules="rules" ref="formRef" label-width="80">
        <n-form-item label="标题" path="title">
          <n-input v-model:value="form.title" placeholder="请输入标题" />
        </n-form-item>
        <n-form-item label="描述" path="description">
          <n-input v-model:value="form.description" placeholder="请输入描述" type="textarea" />
        </n-form-item>

        <n-form-item label="拍摄时间" path="shotAt">
          <n-date-picker
            v-model:value="shotAtTimestamp"
            type="datetime"
            clearable
            style="width: 100%"
          />
        </n-form-item>
        <n-form-item label="可见性" path="visibility">
          <n-select
            v-model:value="form.visibility"
            :options="visibilityOptions"
            placeholder="请选择可见性"
          />
        </n-form-item>

        <n-form-item label="文件名" path="fileName">
          <n-input v-model:value="form.fileName" placeholder="文件名" disabled />
        </n-form-item>
        <n-form-item label="合集" path="collections">
          <n-flex vertical>
            <n-flex>
              <n-tag v-for="c in form.collections || []" :key="c.id" type="info" closable round @close="removeCollection(c.id)">
                {{ c.name }}
              </n-tag>
            </n-flex>
            <n-flex justify="start">
              <n-button text type="primary" @click="openEditCollectionModal">编辑合集</n-button>
            </n-flex>
          </n-flex>
        </n-form-item>
        <n-form-item label="标签" path="tags">
          <n-spin :show="tagLoading" style="width: 100%;">
            <n-flex vertical>
              <n-flex>
                <n-tag
                  v-for="t in form.tags || []"
                  :key="t.id"
                  type="success"
                  closable
                  round
                  @close="removeTag(t.id)"
                >
                  {{ t.name }}
                </n-tag>
                <span
                  v-if="!tagLoading && (!form.tags || form.tags.length === 0)"
                  class="tag-empty-hint"
                >
                  暂无标签
                </span>
              </n-flex>

              <n-flex align="center">
                <n-input
                  v-model:value="tagInput"
                  placeholder="输入新标签名并回车创建并添加"
                  style="width: 280px"
                  @keydown.enter.prevent="handleCreateAndAttachTag"
                  clearable
                />
                <n-button text type="primary" @click="openEditTagModal">编辑标签</n-button>
              </n-flex>
            </n-flex>
          </n-spin>
        </n-form-item>
      </n-form>
      <template #action>
        <n-space>
          <n-button @click="showModal = false">取消</n-button>
          <n-button type="primary" @click="handleSubmit">保存</n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- 编辑标签弹窗 -->
    <n-modal v-model:show="showEditTagModal" title="选择标签" preset="dialog">
      <n-flex vertical>
        <n-transfer
          v-model:value="form.tagIds"
          :options="allTagOptions"
          source-filterable
        />
        <n-flex justify="end">
          <n-button type="primary" @click="handleSaveTags">保存</n-button>
        </n-flex>
      </n-flex>
    </n-modal>

    <!-- 编辑合集弹窗 -->
    <n-modal v-model:show="showEditCollectionModal" title="选择合集" preset="dialog">
      <template #icon>
        <n-icon :component="CollectionsAdd24Regular" />
      </template>
      <n-flex vertical>
        <n-transfer
          v-model:value="form.collectionIds"
          :options="collectionOptions"
          source-filterable
        />
        <n-flex justify="end">
          <n-button type="primary" @click="handleSaveCollections">保存</n-button>
        </n-flex>
      </n-flex>
    </n-modal>

    <!-- 加入合集弹窗 -->
    <n-modal
      v-model:show="showCollectionModal"
      title="加入合集"
      preset="card"
      style="width: 40vw;"
      :mask-closable="false"
    >
      <n-flex vertical>
        <n-transfer
          v-model:value="selectedCollection"
          :options="collectionOptions"
          source-filterable
        />
        <n-flex justify="end">
          <n-button @click="showCollectionModal = false">取消</n-button>
          <n-button type="primary" @click="handleAddCollection">确定</n-button>
        </n-flex>
      </n-flex>
    </n-modal>

    <!-- 位置信息弹窗 -->
    <n-modal
      v-model:show="showLocationModal"
      title="位置信息"
      preset="card"
      style="width: 60vw;"
      :mask-closable="false"
    >
      <n-flex vertical>
        <div v-if="currentLocationVideo" style="margin-bottom: 8px;">
          当前视频：{{ currentLocationVideo.title || currentLocationVideo.fileName }}
        </div>
        <LocationPicker v-model="locationPointForModal" height="400px" :debug="true" />
        <n-flex justify="end" style="margin-top: 12px;">
          <n-button @click="showLocationModal = false">取消</n-button>
          <n-button type="primary" @click="handleSaveLocation">保存位置</n-button>
        </n-flex>
      </n-flex>
    </n-modal>
  </n-flex>
</template>

<script setup lang="ts">
import { ref, reactive, h, computed, onMounted } from 'vue'
import {
  NButton,
  NDropdown,
  useMessage,
  useLoadingBar,
  useDialog,
  type FormInst,
  type DataTableColumns,
  NPopconfirm,
  NTag,
} from 'naive-ui'
import {
  fetchVideoList,
  fetchCollectionsIds,
  addVideosToCollections,
  deleteVideos,
  updateVideo,
  removeVideosFromCollections,
} from '../api/manager'
import type { VideoListResponse } from '../api/manager'
import {
  CloseOutline,
  GridOutline,
  EllipsisVertical,
  VideocamOutline,
  PlayCircleOutline,
} from '@vicons/ionicons5'
import { List20Filled, CollectionsAdd24Regular } from '@vicons/fluent'
import { useCollectionStore } from '../stores/collection'
import { useRoute, useRouter } from 'vue-router'
import {
  fetchTagsWithVideoId,
  fetchTags as fetchAllTags,
  addTagsToVideo,
  removeTagsFromVideo,
  createTag,
} from '../api/tags'
import LocationPicker from '../components/LocationPicker.vue'
import type { LocationPoint } from '../components/LocationPicker.vue'
import { fetchVideoLocation, updateVideoLocation } from '../api/location'
import StatusTag from '../components/StatusTag.vue'

const collectionStore = useCollectionStore()
const message = useMessage()
const dialog = useDialog()
const loadingBar = useLoadingBar()
const route = useRoute()
const router = useRouter()

// ---------- 类型 ----------
type RowKey = string | number
interface VideoItem {
  id: number
  uuid: string
  title: string | null
  description: string | null
  location: string | null
  shotAt: string | null
  fileName: string
  objectKey: string
  presignUrl: string
  videoUrl: string
  coverUrl: string | null
  status?: 'uploading' | 'pending' | 'processing' | 'transcoding' | 'ai_analyzing' | 'done' | 'failed' | null
  visibility: string | null
  createdAt: string
  updatedAt: string
  collections: { id: number; name: string; description: string }[] | null
}

// ---------- 状态 ----------
const videoList = ref<VideoItem[]>([])
const loading = ref(false)
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(10)
const selectedKeys = ref<RowKey[]>([])
const isDeleting = ref(false)
const isCollection = ref(false)
const viewMode = ref<'list' | 'grid'>('list')
const visibilityFilter = ref<string | null>(null)

const visibilityFilterOptions = [
  { label: '私密', value: 'private' },
  { label: '好友可见', value: 'friends' },
  { label: '公开', value: 'public' },
]

const filteredVideoList = computed(() => {
  // TODO: backend filter — 后端接口目前不支持 visibility 参数，先做前端当前页过滤
  if (!visibilityFilter.value) return videoList.value
  return videoList.value.filter((v) => v.visibility === visibilityFilter.value)
})

// ---------- 数据加载 ----------
async function loadVideoList() {
  loading.value = true
  try {
    const params: any = {
      page: currentPage.value,
      pageSize: pageSize.value,
      collectionId:
        collectionStore.activeCollectionId == null ? 0 : collectionStore.activeCollectionId,
    }
    const response = (await fetchVideoList(params)) as unknown as VideoListResponse
    if (response && response.data && Array.isArray(response.data)) {
      total.value = response.total ?? 0
      videoList.value = response.data
    } else {
      console.error('Raw response:', response)
      throw new Error('API 返回格式不正确')
    }
  } catch (error) {
    console.error('加载失败:', error)
    message.error('数据加载失败')
    videoList.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

function onPageSizeChange(size: number) {
  pageSize.value = size
  currentPage.value = 1
  loadVideoList()
}

onMounted(() => {
  if (route.path === '/manager/video') {
    collectionStore.setCollection(0)
  }
  loadVideoList()
})

// ---------- 视图切换 ----------
function toggleView() {
  viewMode.value = viewMode.value === 'list' ? 'grid' : 'list'
}

// ---------- 选择 / 多选 ----------
function handleSelectionChange(keys: RowKey[]) {
  selectedKeys.value = keys
}

function isCardSelected(id: number): boolean {
  return selectedKeys.value.includes(id)
}

function selectAllCurrentPage() {
  selectedKeys.value = filteredVideoList.value.map((v) => v.id)
}

function clearAllSelection() {
  selectedKeys.value = []
}

function handleCardClick(video: VideoItem, event: MouseEvent) {
  if (!isDeleting.value && !isCollection.value) {
    openEditModal(video)
  } else {
    // drag-select 自身处理，阻止冒泡
    event.stopPropagation()
  }
}

// ---------- 删除模式 ----------
function startDelete() {
  isDeleting.value = true
}

function cancelDeleteMode() {
  isDeleting.value = false
  selectedKeys.value = []
}

async function confirmDelete() {
  if (selectedKeys.value.length === 0) {
    message.warning('请先选择要删除的视频')
    return
  }
  try {
    await deleteVideos(selectedKeys.value.map((id) => Number(id)))
    message.success('删除成功')
    // 删除最后一页所有项时回退一页，避免空白页
    const remaining = total.value - selectedKeys.value.length
    const maxPage = Math.max(1, Math.ceil(remaining / pageSize.value))
    if (currentPage.value > maxPage) currentPage.value = maxPage
    selectedKeys.value = []
    isDeleting.value = false
    await loadVideoList()
  } catch (err) {
    console.error(err)
    message.error('删除失败')
  }
}

// 单个删除
async function handleDelete(id: number) {
  try {
    await deleteVideos([id])
    message.success('删除成功')
    const remaining = total.value - 1
    const maxPage = Math.max(1, Math.ceil(remaining / pageSize.value))
    if (currentPage.value > maxPage) currentPage.value = maxPage
    await loadVideoList()
  } catch (err) {
    console.error(err)
    message.error('删除失败')
  }
}

// ---------- 加合集模式 ----------
function startCollection() {
  isCollection.value = true
}

function cancelCollectionMode() {
  isCollection.value = false
  selectedKeys.value = []
}

const showCollectionModal = ref(false)
const selectedCollection = ref<number[]>([])
const collectionOptions = ref<{ label: string; value: string | number }[]>([])

async function addCollection() {
  loadingBar.start()
  try {
    const res = await fetchCollectionsIds()
    collectionOptions.value = res.map((item: any) => ({ label: item.name, value: item.id }))
    loadingBar.finish()
  } catch (err) {
    console.error('获取合集失败', err)
    loadingBar.error()
  }
  showCollectionModal.value = true
}

async function handleAddCollection() {
  if (!selectedCollection.value || selectedCollection.value.length === 0) {
    message.warning('请选择合集')
    return
  }
  if (!selectedKeys.value || selectedKeys.value.length === 0) {
    message.warning('请选择要加入合集的视频')
    return
  }
  try {
    await addVideosToCollections({
      collectionIds: selectedCollection.value.map(Number),
      videoIds: selectedKeys.value.map(Number),
    })
    message.success('添加成功')
    showCollectionModal.value = false
    isCollection.value = false
    selectedKeys.value = []
    await loadVideoList()
  } catch (err) {
    console.error(err)
    message.error('添加失败')
  }
}

// ---------- 位置信息弹窗 ----------
const showLocationModal = ref(false)
const locationTarget = ref<VideoItem | null>(null)
const locationString = ref('')
const currentLocationVideo = computed(() => locationTarget.value)

function parseLocationString(s: string | null | undefined): LocationPoint | null {
  if (s == null || String(s).trim() === '') return null
  const parts = String(s)
    .split(/[,，\s]+/)
    .map((x) => parseFloat(x.trim()))
    .filter((n) => !Number.isNaN(n))
  if (parts.length >= 2) return { lat: parts[0], lng: parts[1] }
  return null
}

const locationPointForModal = computed<LocationPoint | null>({
  get: () => parseLocationString(locationString.value),
  set: (v: LocationPoint | null) => {
    locationString.value = v ? `${v.lat},${v.lng}` : ''
  },
})

function openLocationModal(row: VideoItem) {
  locationTarget.value = row
  locationString.value = row.location || ''
  showLocationModal.value = true

  fetchVideoLocation(row.uuid)
    .then((loc) => {
      if (loc) {
        locationString.value = `${loc.latitude},${loc.longitude}`
      } else if (!row.location) {
        message.info('该视频尚未配置位置信息')
      }
    })
    .catch(() => {
      message.error('获取位置信息失败')
    })
}

function handleSaveLocation() {
  if (!locationTarget.value) {
    showLocationModal.value = false
    return
  }
  const point = locationPointForModal.value
  if (!point) {
    message.warning('请先在地图上选择位置')
    return
  }

  loadingBar.start()
  updateVideoLocation(locationTarget.value.uuid, {
    longitude: point.lng,
    latitude: point.lat,
  })
    .then(() => {
      const id = locationTarget.value!.id
      const idx = videoList.value.findIndex((v) => v.id === id)
      const locationStr = `${point.lat},${point.lng}`
      if (idx !== -1) {
        videoList.value[idx] = { ...videoList.value[idx], location: locationStr }
      }
      locationString.value = locationStr
      message.success('位置信息已更新')
      showLocationModal.value = false
    })
    .catch(() => {
      message.error('更新位置信息失败')
    })
    .finally(() => {
      loadingBar.finish()
    })
}

// ---------- 状态 / 重试 ----------
function getStatusText(status: string): string {
  const statusMap: Record<string, string> = {
    uploading: '上传中',
    pending: '待处理',
    processing: '处理中',
    transcoding: '转码中',
    ai_analyzing: 'AI 分析中',
    failed: '上传失败',
  }
  return statusMap[status] || ''
}

function isProcessingStatus(status: string | null | undefined): boolean {
  return (
    status === 'uploading' ||
    status === 'processing' ||
    status === 'transcoding' ||
    status === 'ai_analyzing'
  )
}

async function handleRetry(_videoId: number) {
  try {
    // TODO: 接入真正的重试 API
    message.info('正在重试上传...')
    await loadVideoList()
    message.success('重试成功')
  } catch (err) {
    console.error('重试失败', err)
    message.error('重试失败')
  }
}

// ---------- 可见性展示 ----------
function visibilityText(v: string | null | undefined): string {
  if (v === 'private') return '私密'
  if (v === 'friends') return '好友'
  if (v === 'public') return '公开'
  return ''
}

function visibilityTagType(v: string | null | undefined): 'default' | 'info' | 'success' | 'warning' {
  if (v === 'public') return 'success'
  if (v === 'friends') return 'info'
  if (v === 'private') return 'warning'
  return 'default'
}

// ---------- 时间相对格式 ----------
function formatRelative(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const diffMs = Date.now() - d.getTime()
  const sec = Math.floor(diffMs / 1000)
  if (sec < 60) return '刚刚'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} 分钟前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} 小时前`
  const day = Math.floor(hour / 24)
  if (day === 1) return '昨天'
  if (day < 7) return `${day} 天前`
  return d.toLocaleDateString('zh-CN')
}

// ---------- 缩略图 / 占位 ----------
function getExt(fileName: string | null | undefined): string {
  if (!fileName) return 'VIDEO'
  const idx = fileName.lastIndexOf('.')
  if (idx < 0 || idx === fileName.length - 1) return 'VIDEO'
  return fileName.slice(idx + 1).toUpperCase()
}

function onCoverError(e: Event) {
  // 封面 404 / 跨域时不要让 broken-image 图标占位，直接隐藏让父容器透出占位
  const img = e.target as HTMLImageElement
  if (img) img.style.display = 'none'
}

// ---------- 打开公共站详情页 ----------
function getPublicSiteOrigin(): string {
  // 优先 env，再退回到 window.location（admin 默认 5173 时映射到公共站 5174），
  // 最后兜底 5174 端口
  const envUrl = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.trim()
  if (envUrl) return envUrl.replace(/\/+$/, '')
  if (typeof window !== 'undefined' && window.location) {
    const { protocol, hostname, port } = window.location
    const targetPort = port === '5173' ? '5174' : port || '5174'
    return `${protocol}//${hostname}:${targetPort}`
  }
  return 'http://localhost:5174'
}

function openVideo(row: VideoItem) {
  if (!row.uuid) {
    message.warning('该视频没有可用链接')
    return
  }
  const url = `${getPublicSiteOrigin()}/video/${row.uuid}`
  window.open(url, '_blank')
}

function goUpload() {
  router.push('/upload')
}

// ---------- 卡片悬停操作菜单（grid 模式） ----------
function getCardActions(video: VideoItem) {
  const options: any[] = []
  if (video.status === 'failed') {
    options.push({ label: '重试', key: 'retry' })
  }
  if (!video.status || video.status === 'done' || video.status === 'pending') {
    options.push(
      { label: '编辑', key: 'edit' },
      { label: '位置信息', key: 'location' },
      { label: '评论', key: 'comment' },
      { label: '在新窗口打开', key: 'open' }
    )
  }
  options.push({ type: 'divider', key: 'd1' })
  options.push({ label: '删除', key: 'delete', props: { style: { color: '#d03050' } } })
  return options
}

function handleCardAction(key: string | number, video: VideoItem) {
  switch (key) {
    case 'edit':
      openEditModal(video)
      break
    case 'location':
      openLocationModal(video)
      break
    case 'comment':
      router.push({
        path: '/manager/comment',
        query: { targetType: 'video', targetId: video.uuid },
      })
      break
    case 'open':
      openVideo(video)
      break
    case 'retry':
      handleRetry(video.id)
      break
    case 'delete':
      dialog.warning({
        title: '确认删除',
        content: '确认要删除这个视频吗？',
        positiveText: '删除',
        negativeText: '取消',
        onPositiveClick: () => handleDelete(video.id),
      })
      break
  }
}

// ---------- 列表视图列定义 ----------
const baseColumns: DataTableColumns<VideoItem> = [
  {
    title: '序号',
    key: 'index',
    width: 60,
    render: (_row, index) => index + 1,
  },
  {
    title: '缩略图',
    key: 'cover',
    width: 96,
    render(row) {
      if (row.coverUrl) {
        return h('img', {
          src: row.coverUrl,
          loading: 'lazy',
          class: 'list-cover',
          onError: onCoverError,
        })
      }
      return h(
        'div',
        { class: 'list-cover list-cover--placeholder' },
        [h(NTag, { size: 'tiny', type: 'default' }, { default: () => getExt(row.fileName) })]
      )
    },
  },
  { title: '标题', key: 'title', render: (row) => row.title || '-' },
  {
    title: '描述',
    key: 'description',
    render: (row) => row.description || '-',
    ellipsis: { tooltip: true },
  },
  { title: '文件名', key: 'fileName', ellipsis: { tooltip: true } },
  {
    title: '合集',
    key: 'collections',
    render: (row) => {
      if (!row.collections || row.collections.length === 0) return '-'
      return row.collections.map((c) => c.name).join(', ')
    },
  },
  {
    title: '可见性',
    key: 'visibility',
    width: 90,
    render: (row) =>
      row.visibility
        ? h(
            NTag,
            { size: 'small', type: visibilityTagType(row.visibility), bordered: false },
            { default: () => visibilityText(row.visibility) }
          )
        : '-',
  },
  {
    title: '状态',
    key: 'status',
    width: 130,
    render: (row) => h(StatusTag, { status: row.status }),
  },
  {
    title: '创建时间',
    key: 'createdAt',
    width: 120,
    render: (row) =>
      h(
        'span',
        { title: new Date(row.createdAt).toLocaleString('zh-CN') },
        formatRelative(row.createdAt)
      ),
  },
  {
    title: '操作',
    key: 'actions',
    width: 180,
    render(row) {
      const canEdit = !row.status || row.status === 'done' || row.status === 'pending'
      const isFailed = row.status === 'failed'

      const moreOptions: any[] = []
      if (isFailed) moreOptions.push({ label: '重试', key: 'retry' })
      if (canEdit) {
        moreOptions.push(
          { label: '位置信息', key: 'location' },
          { label: '评论', key: 'comment' },
          { label: '在新窗口打开', key: 'open' }
        )
      }

      const handleMoreSelect = (key: string) => {
        if (key === 'retry') handleRetry(row.id)
        else if (key === 'location') openLocationModal(row)
        else if (key === 'comment')
          router.push({
            path: '/manager/comment',
            query: { targetType: 'video', targetId: row.uuid },
          })
        else if (key === 'open') openVideo(row)
      }

      return h('div', { style: 'display: flex; align-items: center; gap: 6px;' }, [
        canEdit
          ? h(
              NButton,
              { size: 'small', onClick: () => openEditModal(row) },
              { default: () => '编辑' }
            )
          : null,
        moreOptions.length > 0
          ? h(
              NDropdown,
              { trigger: 'click', options: moreOptions, onSelect: handleMoreSelect },
              { default: () => h(NButton, { size: 'small' }, { default: () => '更多' }) }
            )
          : null,
        h(
          NPopconfirm,
          {
            onPositiveClick: () => handleDelete(row.id),
            positiveText: '删除',
            negativeText: '取消',
            showIcon: false,
          },
          {
            default: () => '确认要删除吗？',
            trigger: () => h(NButton, { size: 'small', type: 'error' }, { default: () => '删除' }),
          }
        ),
      ])
    },
  },
]

const columns = computed<DataTableColumns<VideoItem>>(() => {
  return isDeleting.value || isCollection.value
    ? [{ type: 'selection', key: 'selection', width: 40 }, ...baseColumns]
    : baseColumns
})

// 行双击打开视频（列表视图）
function rowProps(row: VideoItem) {
  return {
    onDblclick: () => openVideo(row),
    style: 'cursor: pointer',
  }
}

// ---------- 编辑表单 ----------
const showModal = ref(false)
const formRef = ref<FormInst | null>(null)
const tagLoading = ref(false)
const originalCollectionIds = ref<number[]>([])

const form = reactive<
  VideoItem & {
    collectionIds: number[]
    tags: { id: number; name: string }[] | null
    tagIds: number[]
  }
>({
  id: 0,
  uuid: '',
  title: '',
  description: '',
  location: '',
  shotAt: null,
  fileName: '',
  objectKey: '',
  presignUrl: '',
  videoUrl: '',
  coverUrl: '',
  status: null,
  visibility: '',
  createdAt: '',
  updatedAt: '',
  collections: null,
  collectionIds: [],
  tags: null,
  tagIds: [] as number[],
})

const rules = {
  title: [{ required: true, message: '请输入标题', trigger: 'blur' }],
}

const shotAtTimestamp = computed<number | null>({
  get: () => (form.shotAt ? new Date(form.shotAt).getTime() : null),
  set: (v: number | null) => {
    form.shotAt = v ? new Date(v).toISOString() : null
  },
})

const visibilityOptions = [
  { label: '私密', value: 'private' },
  { label: '好友可见', value: 'friends' },
  { label: '公开', value: 'public' },
]

type SimpleTag = { id: number; name: string }

const tagInput = ref('')
const showEditTagModal = ref(false)
const allTagOptions = ref<{ label: string; value: number }[]>([])

function openEditModal(row: VideoItem) {
  Object.assign(form as any, { ...row })
  form.collectionIds = row.collections ? row.collections.map((c) => c.id) : []
  originalCollectionIds.value = [...form.collectionIds]
  form.tags = []
  form.tagIds = []
  tagLoading.value = true
  showModal.value = true

  fetchTagsWithVideoId(row.id)
    .then((tags: SimpleTag[]) => {
      form.tags = tags || []
      form.tagIds = (tags || []).map((t) => t.id)
    })
    .catch(() => {
      form.tags = []
      form.tagIds = []
    })
    .finally(() => {
      tagLoading.value = false
    })
}

async function handleSubmit() {
  formRef.value?.validate(async (errors) => {
    if (errors) return
    try {
      const oldIds = originalCollectionIds.value || []
      const newIds = (form.collectionIds || []).map(Number)
      const oldSet = new Set(oldIds)
      const newSet = new Set(newIds)
      const added = newIds.filter((id) => !oldSet.has(id))
      const removed = oldIds.filter((id) => !newSet.has(id))

      await updateVideo(form.id, {
        title: form.title ?? '',
        description: form.description ?? '',
        shotAt: form.shotAt,
        visibility: form.visibility,
      })

      if (added.length > 0) {
        await addVideosToCollections({ collectionIds: added, videoIds: [form.id] })
      }
      if (removed.length > 0) {
        await removeVideosFromCollections({ collectionIds: removed, videoIds: [form.id] })
      }

      message.success('编辑成功')
      showModal.value = false
      await loadVideoList()
    } catch (err) {
      console.error(err)
      message.error('更新失败')
    }
  })
}

const showEditCollectionModal = ref(false)

async function openEditCollectionModal() {
  const res = await fetchCollectionsIds()
  collectionOptions.value = res.map((c) => ({ label: c.name, value: c.id }))
  form.collectionIds = form.collections ? form.collections.map((c) => c.id) : []
  showEditCollectionModal.value = true
}

function handleSaveCollections() {
  form.collections = collectionOptions.value
    .filter((opt) => form.collectionIds.includes(Number(opt.value)))
    .map((opt) => ({ id: Number(opt.value), name: opt.label, description: '' }))
  showEditCollectionModal.value = false
}

function removeCollection(id: number) {
  if (form.collections) {
    form.collections = form.collections.filter((c) => c.id !== id)
    form.collectionIds = form.collectionIds.filter((cid) => cid !== id)
  }
}

async function openEditTagModal() {
  const all = await fetchAllTags()
  allTagOptions.value = (all || []).map((t: any) => ({ label: t.name, value: Number(t.id) }))
  form.tagIds = (form.tags || []).map((t) => t.id)
  showEditTagModal.value = true
}

async function handleSaveTags() {
  const oldIds = (form.tags || []).map((t) => t.id)
  const newIds = (form.tagIds || []).map(Number)
  const oldSet = new Set(oldIds)
  const newSet = new Set(newIds)
  const added = newIds.filter((id) => !oldSet.has(id))
  const removed = oldIds.filter((id) => !newSet.has(id))

  if (added.length > 0) {
    await addTagsToVideo({ tagIds: added, videoId: Number(form.id) })
  }
  if (removed.length > 0) {
    await removeTagsFromVideo({ tagIds: removed, videoId: Number(form.id) })
  }

  const tags = await fetchTagsWithVideoId(form.id)
  form.tags = tags || []
  form.tagIds = (tags || []).map((t) => t.id)
  showEditTagModal.value = false
}

async function removeTag(tagId: number) {
  if (!form.id) return
  await removeTagsFromVideo({ tagIds: [tagId], videoId: Number(form.id) })
  if (form.tags) {
    form.tags = form.tags.filter((t) => t.id !== tagId)
  }
  form.tagIds = form.tagIds.filter((id) => id !== tagId)
}

/**
 * 把 createTag 的多种返回收敛成 { id, name }；
 * 兼容三种形态：
 *   - { id, name } 对象
 *   - 字符串协议：'tag添加成功' / '已有同名tag' / '添加失败'
 */
async function resolveCreatedTag(name: string, raw: any): Promise<SimpleTag> {
  if (raw && typeof raw === 'object' && raw.id) {
    return { id: Number(raw.id), name: String(raw.name ?? name) }
  }
  if (typeof raw === 'string') {
    if (raw === '添加失败') throw new Error('标签创建失败')
    if (raw === '已有同名tag' || raw === 'tag添加成功') {
      const all = await fetchAllTags()
      const found = (all || []).find((t: any) => t.name === name)
      if (!found) throw new Error('找不到同名标签')
      return { id: Number(found.id), name: found.name }
    }
  }
  throw new Error('未知的返回格式')
}

async function handleCreateAndAttachTag() {
  const name = (tagInput.value || '').trim()
  if (!name) {
    message.warning('请输入标签名称')
    return
  }
  if (!form.id || form.id === 0) {
    message.error('无效的视频ID')
    return
  }

  try {
    const raw = await createTag({ name })
    const tag = await resolveCreatedTag(name, raw)

    if (form.tagIds.includes(tag.id)) {
      message.warning('该标签已存在')
      tagInput.value = ''
      return
    }

    await addTagsToVideo({ tagIds: [tag.id], videoId: Number(form.id) })

    if (!form.tags) form.tags = []
    form.tags.push({ id: tag.id, name: tag.name })
    form.tagIds.push(tag.id)
    tagInput.value = ''
    message.success('标签添加成功')
  } catch (error) {
    console.error('操作失败:', error)
    message.error(error instanceof Error ? error.message : '操作失败')
  }
}
</script>

<style scoped>
/* ---------- 工具栏 / 提示条 ---------- */
.collection-area {
  height: 50px;
  align-items: center;
  background-color: var(--collection-area-bg, rgba(60, 213, 111, 0.12));
  border-radius: 6px;
  width: 100%;
}
.collection-area__hint {
  margin-left: 12px;
  font-weight: 600;
  font-size: 14px;
}

/* ---------- 列表视图缩略图 ---------- */
:deep(.list-cover) {
  width: 80px;
  height: 45px;
  border-radius: 4px;
  object-fit: cover;
  display: block;
  background: var(--n-color-modal, rgba(127, 127, 127, 0.08));
}
:deep(.list-cover--placeholder) {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: var(--n-text-color-3);
}

/* ---------- 网格卡片 ---------- */
.video-card-wrapper {
  position: relative;
}

.cover-container {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 6px;
  overflow: hidden;
  background: var(--n-color-modal, rgba(127, 127, 127, 0.08));
}

.cover-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: var(--n-text-color-3);
}
.cover-placeholder__ext {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

/* ---------- hover 播放按钮 ---------- */
.play-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: rgba(0, 0, 0, 0);
  color: #fff;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.18s ease, background 0.18s ease;
  padding: 0;
}
.video-card-wrapper:hover .play-overlay {
  opacity: 1;
  background: rgba(0, 0, 0, 0.28);
}
.play-overlay:focus-visible {
  outline: 2px solid #3cd56f;
  outline-offset: -2px;
}

/* ---------- 选中态（与图片页保持一致的浅绿） ---------- */
.selected-card {
  background-color: rgba(60, 213, 111, 0.18) !important;
  border: 2px solid #3cd56f !important;
  transform: translateY(2px);
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
}
.selected-card:hover {
  background-color: rgba(60, 213, 111, 0.26) !important;
}

/* ---------- 状态遮罩 ---------- */
.status-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}
.status-uploading { background-color: rgba(24, 144, 255, 0.7); }
.status-pending { background-color: rgba(128, 128, 128, 0.7); }
.status-processing { background-color: rgba(250, 140, 22, 0.7); }
.status-transcoding { background-color: rgba(146, 84, 222, 0.7); }
.status-ai_analyzing { background-color: rgba(36, 142, 211, 0.7); }
.status-failed { background-color: rgba(255, 77, 79, 0.75); }
.status-text {
  color: #fff;
  font-size: 14px;
  font-weight: bold;
  margin-top: 6px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
}

/* ---------- 卡片底部信息 ---------- */
.card-title {
  margin-top: 8px;
  font-size: 13px;
  font-weight: 500;
}
.card-meta {
  margin-top: 2px;
}
.card-meta__time {
  font-size: 12px;
  color: var(--n-text-color-3);
}

/* ---------- 卡片悬停操作菜单 ---------- */
.card-action-trigger {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 11;
  opacity: 0;
  transition: opacity 0.2s;
  background: rgba(255, 255, 255, 0.85);
  border-radius: 4px;
  padding: 2px 4px;
  line-height: 1;
}
.video-card-wrapper:hover .card-action-trigger {
  opacity: 1;
}

/* ---------- 标签编辑空状态文案 ---------- */
.tag-empty-hint {
  font-size: 12px;
  color: var(--n-text-color-3);
}
</style>
