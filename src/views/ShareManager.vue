<template>
  <div class="p-8">
    <n-card class="max-w-6xl mx-auto">
      <n-tabs v-model:value="activeTab" type="line" animated>
        <!-- ==================== 创建分享 Tab ==================== -->
        <n-tab-pane name="create" tab="创建分享">
          <n-tabs v-model:value="mediaType" type="segment" style="margin-bottom: 16px;">
            <n-tab-pane name="video" tab="视频" />
            <n-tab-pane name="image" tab="图片" />
            <n-tab-pane name="collection" tab="合集" />
          </n-tabs>

          <n-spin :show="mediaLoading">
            <!-- 视频网格 -->
            <n-grid v-if="mediaType === 'video'" cols="4" x-gap="16" y-gap="16">
              <n-grid-item v-for="item in videoItems" :key="item.id">
                <n-card size="small" hoverable class="media-card" @click="openShareDialog('video', item.id, item.title || item.fileName, item.coverUrl)">
                  <template #cover>
                    <div class="cover-wrapper">
                      <img v-if="item.coverUrl" :src="item.coverUrl" class="cover-image" />
                      <div v-else class="cover-placeholder">
                        <n-icon :component="VideocamOutline" size="48" color="#aaa" />
                      </div>
                      <div class="media-overlay">
                        <n-button type="primary" size="small" ghost>
                          <template #icon><n-icon :component="ShareSocialOutline" /></template>
                          分享
                        </n-button>
                      </div>
                    </div>
                  </template>
                  <n-ellipsis :line-clamp="1" :tooltip="{ width: 240 }">
                    {{ item.title || item.fileName }}
                  </n-ellipsis>
                </n-card>
              </n-grid-item>
            </n-grid>

            <!-- 图片网格 -->
            <n-grid v-if="mediaType === 'image'" cols="4" x-gap="16" y-gap="16">
              <n-grid-item v-for="item in imageItems" :key="item.id">
                <n-card size="small" hoverable class="media-card" @click="openShareDialog('image', item.id, item.title || item.fileName, toMediumUrl(item.imageUrl))">
                  <template #cover>
                    <div class="cover-wrapper">
                      <img :src="toMediumUrl(item.imageUrl)" class="cover-image" />
                      <div class="media-overlay">
                        <n-button type="primary" size="small" ghost>
                          <template #icon><n-icon :component="ShareSocialOutline" /></template>
                          分享
                        </n-button>
                      </div>
                    </div>
                  </template>
                  <n-ellipsis :line-clamp="1" :tooltip="{ width: 240 }">
                    {{ item.title || item.fileName }}
                  </n-ellipsis>
                </n-card>
              </n-grid-item>
            </n-grid>

            <!-- 合集网格 -->
            <n-grid v-if="mediaType === 'collection'" cols="4" x-gap="16" y-gap="16">
              <n-grid-item v-for="item in collectionItems" :key="item.id">
                <n-card size="small" hoverable class="media-card" @click="openShareDialog('collection', item.id, item.name, item.coverUrl)">
                  <template #cover>
                    <div class="cover-wrapper">
                      <img v-if="item.coverUrl" :src="item.coverUrl" class="cover-image" />
                      <div v-else class="cover-placeholder">
                        <n-icon :component="AlbumsOutline" size="48" color="#aaa" />
                      </div>
                      <div class="media-overlay">
                        <n-button type="primary" size="small" ghost>
                          <template #icon><n-icon :component="ShareSocialOutline" /></template>
                          分享
                        </n-button>
                      </div>
                    </div>
                  </template>
                  <n-ellipsis :line-clamp="1" :tooltip="{ width: 240 }">
                    {{ item.name }}
                  </n-ellipsis>
                  <template #footer>
                    <span class="text-gray-400 text-xs">{{ item.description || '暂无描述' }}</span>
                  </template>
                </n-card>
              </n-grid-item>
            </n-grid>

            <n-empty v-if="!mediaLoading && currentMediaEmpty" description="暂无内容" style="margin: 40px 0;" />
          </n-spin>

          <n-flex justify="flex-end" style="margin-top: 16px;">
            <n-pagination
              v-model:page="mediaPage"
              v-model:page-size="mediaPageSize"
              :item-count="mediaTotalCount"
              show-size-picker
              :page-sizes="[12, 24, 48]"
              @update:page="fetchMediaData"
              @update:page-size="handleMediaPageSizeChange"
            />
          </n-flex>
        </n-tab-pane>

        <!-- ==================== 我的分享 Tab ==================== -->
        <n-tab-pane name="manage" tab="我的分享">
          <div class="function-area">
            <n-flex align="center">
              <n-select
                v-model:value="filterType"
                :options="targetTypeFilterOptions"
                placeholder="按类型筛选"
                style="width: 140px"
                clearable
              />
              <n-button type="primary" @click="fetchShares">刷新</n-button>
            </n-flex>
          </div>

          <n-data-table
            :columns="columns"
            :data="displayShares"
            :loading="shareLoading"
            :pagination="sharePagination"
            @update:page="handleSharePageChange"
            @update:page-size="handleSharePageSizeChange"
          />
        </n-tab-pane>
      </n-tabs>
    </n-card>

    <!-- ==================== 创建分享弹窗 ==================== -->
    <n-modal v-model:show="showCreateModal" preset="card" style="width: 520px;" :title="createDialogTitle">
      <div class="share-preview">
        <img v-if="selectedMedia.coverUrl" :src="selectedMedia.coverUrl" class="preview-thumb" />
        <div v-else class="preview-placeholder">
          <n-icon :component="selectedMedia.targetType === 'video' ? VideocamOutline : selectedMedia.targetType === 'image' ? ImageOutline : AlbumsOutline" size="40" color="#999" />
        </div>
        <div class="preview-info">
          <div class="preview-title">{{ selectedMedia.name }}</div>
          <n-tag :type="targetTagType(selectedMedia.targetType)" size="small" :bordered="false">
            {{ formatTargetType(selectedMedia.targetType) }}
          </n-tag>
        </div>
      </div>
      <n-divider style="margin: 12px 0;" />
      <n-form :model="createForm" label-width="100" label-placement="left">
        <n-form-item label="自定义标题">
          <n-input v-model:value="createForm.title" placeholder="留空使用原资源标题" />
        </n-form-item>
        <n-form-item label="描述">
          <n-input v-model:value="createForm.description" type="textarea" placeholder="可选描述" :rows="2" />
        </n-form-item>
        <n-form-item label="访问密码">
          <n-input v-model:value="createForm.password" type="password" show-password-on="click" placeholder="留空则无密码保护" />
        </n-form-item>
        <n-form-item label="过期时间">
          <n-date-picker v-model:value="createExpireTs" type="datetime" clearable style="width: 100%" />
        </n-form-item>
        <n-form-item label="最大访问次数">
          <n-input-number v-model:value="createForm.maxViews" placeholder="留空不限制" style="width: 100%" :min="1" :show-button="false" />
        </n-form-item>
      </n-form>
      <template #action>
        <n-space>
          <n-button @click="showCreateModal = false">取消</n-button>
          <n-button type="primary" @click="handleCreate" :loading="submitting">创建分享</n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- ==================== 编辑分享弹窗 ==================== -->
    <n-modal v-model:show="showEditModal" title="编辑分享" preset="card" style="width: 520px;">
      <n-form :model="editForm" label-width="100" label-placement="left">
        <n-form-item label="标题">
          <n-input v-model:value="editForm.title" placeholder="分享标题" />
        </n-form-item>
        <n-form-item label="描述">
          <n-input v-model:value="editForm.description" type="textarea" placeholder="描述" :rows="2" />
        </n-form-item>
        <n-form-item label="新密码">
          <n-input v-model:value="editForm.password" type="password" show-password-on="click" placeholder="留空不修改" />
        </n-form-item>
        <n-form-item label="清除密码">
          <n-switch v-model:value="editForm.clearPassword" />
        </n-form-item>
        <n-form-item label="过期时间">
          <n-date-picker v-model:value="editExpireTs" type="datetime" clearable style="width: 100%" />
        </n-form-item>
        <n-form-item label="最大访问次数">
          <n-input-number v-model:value="editForm.maxViews" placeholder="不限制" style="width: 100%" :min="1" :show-button="false" />
        </n-form-item>
      </n-form>
      <template #action>
        <n-space>
          <n-button @click="showEditModal = false">取消</n-button>
          <n-button type="primary" @click="handleUpdate" :loading="submitting">保存</n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- ==================== 统计弹窗 ==================== -->
    <n-modal v-model:show="showStatsModal" title="访问统计" preset="card" style="width: 680px;">
      <n-spin :show="statsLoading">
        <template v-if="stats">
          <n-grid :cols="2" :x-gap="16" :y-gap="12" class="stats-overview">
            <n-gi>
              <n-statistic label="总访问次数" :value="stats.totalViews" />
            </n-gi>
            <n-gi>
              <n-statistic label="独立 IP 数" :value="stats.uniqueIps" />
            </n-gi>
          </n-grid>
          <n-divider />
          <n-h4>地理位置分布 (Top 10)</n-h4>
          <n-empty v-if="stats.topLocations.length === 0" description="暂无数据" />
          <n-data-table v-else :columns="geoColumns" :data="stats.topLocations" :pagination="false" size="small" />
          <n-divider />
          <n-h4>最近访问记录</n-h4>
          <n-empty v-if="stats.recentAccess.length === 0" description="暂无访问记录" />
          <n-data-table v-else :columns="accessColumns" :data="stats.recentAccess" :pagination="false" size="small" :max-height="300" />
        </template>
      </n-spin>
    </n-modal>

    <!-- ==================== 二维码 & 链接弹窗 ==================== -->
    <n-modal v-model:show="showQRModal" title="分享链接" preset="card" style="width: 400px;">
      <div class="qr-container">
        <img :src="qrCodeUrl" alt="分享二维码" class="qr-image" />
        <n-input :value="currentShareUrl" readonly class="share-url-input">
          <template #suffix>
            <n-button text @click="copyUrl(currentShareUrl)">
              <template #icon><n-icon :component="CopyOutline" /></template>
            </n-button>
          </template>
        </n-input>
      </div>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, h, onMounted, watch } from 'vue'
import {
  NButton,
  NDropdown,
  NTag,
  NPopconfirm,
  NIcon,
  useMessage,
  type DataTableColumns
} from 'naive-ui'
import {
  CopyOutline,
  ShareSocialOutline,
  VideocamOutline,
  ImageOutline,
  AlbumsOutline
} from '@vicons/ionicons5'
import {
  createShare,
  getMyShares,
  updateShare,
  deleteShare,
  getShareStats,
  getShareQRCodeUrl,
  type ShareVO,
  type ShareCreateDTO,
  type ShareUpdateDTO,
  type ShareStatsVO,
  type ShareTargetType
} from '../api/share'
import { fetchVideoList } from '../api/manager'
import { fetchImages } from '../api/images'
import { fetchCollections, fetchImageCollections } from '../api/manager'

const message = useMessage()

// ==================== 顶层 Tab ====================
const activeTab = ref<'create' | 'manage'>('create')

// ==================== 媒体浏览 ====================
const mediaType = ref<'video' | 'image' | 'collection'>('video')
const mediaLoading = ref(false)
const mediaPage = ref(1)
const mediaPageSize = ref(12)
const mediaTotalCount = ref(0)

const videoItems = ref<any[]>([])
const imageItems = ref<any[]>([])
const collectionItems = ref<any[]>([])

const currentMediaEmpty = computed(() => {
  if (mediaType.value === 'video') return videoItems.value.length === 0
  if (mediaType.value === 'image') return imageItems.value.length === 0
  return collectionItems.value.length === 0
})

function toMediumUrl(url: string): string {
  return url.replace(/\/raw\/[^/]+$/, '/medium/medium.jpg')
}

async function fetchMediaData() {
  mediaLoading.value = true
  try {
    if (mediaType.value === 'video') {
      const res: any = await fetchVideoList({
        page: mediaPage.value,
        pageSize: mediaPageSize.value,
        collectionId: 0
      })
      videoItems.value = res.data || []
      mediaTotalCount.value = res.total || 0
    } else if (mediaType.value === 'image') {
      const res: any = await fetchImages({
        page: mediaPage.value,
        pageSize: mediaPageSize.value
      })
      imageItems.value = res.data || []
      mediaTotalCount.value = res.total || 0
    } else {
      const res: any = await fetchCollections({
        page: mediaPage.value,
        pageSize: mediaPageSize.value,
        keyword: ''
      })
      collectionItems.value = Array.isArray(res) ? res : (res.data || [])
      mediaTotalCount.value = Array.isArray(res) ? res.length : (res.total || res.length || 0)
    }
  } catch {
    message.error('加载媒体列表失败')
  } finally {
    mediaLoading.value = false
  }
}

function handleMediaPageSizeChange() {
  mediaPage.value = 1
  fetchMediaData()
}

watch(mediaType, () => {
  mediaPage.value = 1
  fetchMediaData()
})

// ==================== 创建分享 ====================
const showCreateModal = ref(false)
const submitting = ref(false)
const createExpireTs = ref<number | null>(null)

const selectedMedia = ref<{
  targetType: ShareTargetType
  targetId: number
  name: string
  coverUrl: string | null
}>({
  targetType: 'video',
  targetId: 0,
  name: '',
  coverUrl: null
})

const createForm = ref({
  title: '',
  description: '',
  password: '',
  maxViews: null as number | null
})

const createDialogTitle = computed(() => {
  return `分享${formatTargetType(selectedMedia.value.targetType)}`
})

function openShareDialog(type: ShareTargetType, id: number, name: string, coverUrl: string | null | undefined) {
  selectedMedia.value = { targetType: type, targetId: id, name, coverUrl: coverUrl || null }
  createForm.value = { title: '', description: '', password: '', maxViews: null }
  createExpireTs.value = null
  showCreateModal.value = true
}

async function handleCreate() {
  const payload: ShareCreateDTO = {
    targetType: selectedMedia.value.targetType,
    targetId: selectedMedia.value.targetId
  }
  if (createForm.value.title) payload.title = createForm.value.title
  if (createForm.value.description) payload.description = createForm.value.description
  if (createForm.value.password) payload.password = createForm.value.password
  if (createExpireTs.value) payload.expiresAt = new Date(createExpireTs.value).toISOString()
  if (createForm.value.maxViews) payload.maxViews = createForm.value.maxViews

  submitting.value = true
  try {
    const result = await createShare(payload)
    message.success('分享创建成功')
    showCreateModal.value = false
    showQR(result)
  } catch {
    message.error('创建失败')
  } finally {
    submitting.value = false
  }
}

// ==================== 我的分享列表 ====================
const shareList = ref<ShareVO[]>([])
const shareLoading = ref(false)
const sharePage = ref(1)
const sharePageSize = ref(20)
const shareTotalItems = ref(0)
const filterType = ref<ShareTargetType | null>(null)

const targetTypeFilterOptions = [
  { label: '视频', value: 'video' },
  { label: '图片', value: 'image' },
  { label: '合集', value: 'collection' }
]

const displayShares = computed(() => {
  if (!filterType.value) return shareList.value
  return shareList.value.filter(s => s.targetType === filterType.value)
})

const sharePagination = computed(() => ({
  page: sharePage.value,
  pageSize: sharePageSize.value,
  itemCount: shareTotalItems.value,
  showSizePicker: true,
  pageSizes: [10, 20, 50]
}))

async function fetchShares() {
  shareLoading.value = true
  try {
    const res = await getMyShares(sharePage.value, sharePageSize.value)
    shareList.value = res.data
    shareTotalItems.value = res.total
  } catch {
    message.error('获取分享列表失败')
  } finally {
    shareLoading.value = false
  }
}

function handleSharePageChange(page: number) {
  sharePage.value = page
  fetchShares()
}

function handleSharePageSizeChange(size: number) {
  sharePageSize.value = size
  sharePage.value = 1
  fetchShares()
}

watch(activeTab, (tab) => {
  if (tab === 'manage') fetchShares()
})

// ==================== 编辑分享 ====================
const showEditModal = ref(false)
const editingId = ref(0)
const editExpireTs = ref<number | null>(null)
const editForm = ref({
  title: '',
  description: '',
  password: '',
  clearPassword: false,
  maxViews: null as number | null
})

function openEditModal(row: ShareVO) {
  editingId.value = row.id
  editForm.value = {
    title: row.title || '',
    description: row.description || '',
    password: '',
    clearPassword: false,
    maxViews: row.maxViews
  }
  editExpireTs.value = row.expiresAt ? new Date(row.expiresAt).getTime() : null
  showEditModal.value = true
}

async function handleUpdate() {
  const payload: ShareUpdateDTO = {}
  if (editForm.value.title) payload.title = editForm.value.title
  if (editForm.value.description) payload.description = editForm.value.description
  if (editForm.value.password) payload.password = editForm.value.password
  if (editForm.value.clearPassword) payload.clearPassword = true
  if (editExpireTs.value) payload.expiresAt = new Date(editExpireTs.value).toISOString()
  if (editForm.value.maxViews) payload.maxViews = editForm.value.maxViews

  submitting.value = true
  try {
    await updateShare(editingId.value, payload)
    message.success('更新成功')
    showEditModal.value = false
    fetchShares()
  } catch {
    message.error('更新失败')
  } finally {
    submitting.value = false
  }
}

// ==================== 删除 ====================
async function handleDelete(id: number) {
  try {
    await deleteShare(id)
    message.success('删除成功')
    fetchShares()
  } catch {
    message.error('删除失败')
  }
}

// ==================== 统计 ====================
const showStatsModal = ref(false)
const statsLoading = ref(false)
const stats = ref<ShareStatsVO | null>(null)

async function openStatsModal(id: number) {
  stats.value = null
  showStatsModal.value = true
  statsLoading.value = true
  try {
    stats.value = await getShareStats(id)
  } catch {
    message.error('获取统计失败')
  } finally {
    statsLoading.value = false
  }
}

const geoColumns: DataTableColumns = [
  { title: '地区', key: 'location' },
  { title: '访问次数', key: 'count', width: 100 }
]

const accessColumns: DataTableColumns = [
  { title: 'IP', key: 'accessIp', width: 140 },
  { title: '地区', key: 'location' },
  { title: '访问时间', key: 'accessedAt', width: 180, render: (row: any) => formatTime(row.accessedAt) }
]

// ==================== 二维码 & 复制 ====================
const showQRModal = ref(false)
const qrCodeUrl = ref('')
const currentShareUrl = ref('')

function showQR(share: ShareVO) {
  qrCodeUrl.value = getShareQRCodeUrl(share.shareCode)
  currentShareUrl.value = share.shareUrl
  showQRModal.value = true
}

async function copyUrl(url: string) {
  try {
    await navigator.clipboard.writeText(url)
    message.success('链接已复制')
  } catch {
    message.error('复制失败')
  }
}

// ==================== 工具函数 ====================
function formatTime(time: string | null) {
  if (!time) return '-'
  return new Date(time).toLocaleString('zh-CN')
}

function formatTargetType(type: ShareTargetType) {
  const map: Record<ShareTargetType, string> = { video: '视频', image: '图片', collection: '合集' }
  return map[type] || type
}

function targetTagType(type: ShareTargetType) {
  const map: Record<ShareTargetType, 'info' | 'success' | 'warning'> = {
    video: 'info',
    image: 'success',
    collection: 'warning'
  }
  return map[type] || 'default'
}

function statusType(status: string) {
  const map: Record<string, 'success' | 'warning' | 'error'> = {
    active: 'success',
    expired: 'warning',
    disabled: 'error'
  }
  return map[status] || 'default'
}

function statusLabel(status: string) {
  const map: Record<string, string> = { active: '有效', expired: '已过期', disabled: '已禁用' }
  return map[status] || status
}

// ==================== 分享列表列定义 ====================
const columns = computed<DataTableColumns<ShareVO>>(() => [
  {
    title: '标题',
    key: 'title',
    ellipsis: { tooltip: true },
    render: (row) => row.title || `${formatTargetType(row.targetType)} #${row.targetId}`
  },
  {
    title: '类型',
    key: 'targetType',
    width: 80,
    render: (row) => formatTargetType(row.targetType)
  },
  {
    title: '状态',
    key: 'status',
    width: 80,
    render: (row) => h(NTag, { type: statusType(row.status), size: 'small', bordered: false }, { default: () => statusLabel(row.status) })
  },
  {
    title: '密码',
    key: 'hasPassword',
    width: 60,
    render: (row) => row.hasPassword ? '是' : '否'
  },
  {
    title: '访问/上限',
    key: 'viewCount',
    width: 100,
    render: (row) => `${row.viewCount}${row.maxViews ? ' / ' + row.maxViews : ''}`
  },
  {
    title: '过期时间',
    key: 'expiresAt',
    width: 170,
    render: (row) => row.expiresAt ? formatTime(row.expiresAt) : '永久'
  },
  {
    title: '创建时间',
    key: 'createdAt',
    width: 170,
    render: (row) => formatTime(row.createdAt)
  },
  {
    title: '操作',
    key: 'actions',
    width: 160,
    render(row) {
      const moreOptions = [
        { label: '复制链接', key: 'copy' },
        { label: '二维码', key: 'qr' },
        { label: '统计', key: 'stats' }
      ]
      const handleMoreSelect = (key: string) => {
        if (key === 'copy') copyUrl(row.shareUrl)
        else if (key === 'qr') showQR(row)
        else if (key === 'stats') openStatsModal(row.id)
      }
      return h('div', { style: 'display: flex; align-items: center; gap: 6px;' }, [
        h(NButton, { size: 'small', onClick: () => openEditModal(row) }, { default: () => '编辑' }),
        h(NDropdown, { trigger: 'click', options: moreOptions, onSelect: handleMoreSelect }, {
          default: () => h(NButton, { size: 'small' }, { default: () => '更多' })
        }),
        h(NPopconfirm, {
          onPositiveClick: () => handleDelete(row.id),
          positiveText: '删除',
          negativeText: '取消'
        }, {
          default: () => '确认删除此分享？访问日志也将被清除。',
          trigger: () => h(NButton, { size: 'small', type: 'error' }, { default: () => '删除' })
        })
      ])
    }
  }
])

// ==================== 生命周期 ====================
onMounted(() => {
  fetchMediaData()
})
</script>

<style scoped>
.function-area {
  margin-bottom: 16px;
}

/* 媒体卡片 */
.media-card {
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.media-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);
}

.cover-wrapper {
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  position: relative;
  background-color: #f5f5f5;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cover-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.cover-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  opacity: 0.5;
}

.media-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
}

.media-card:hover .media-overlay {
  opacity: 1;
}

/* 分享预览 */
.share-preview {
  display: flex;
  align-items: center;
  gap: 14px;
}

.preview-thumb {
  width: 100px;
  height: 64px;
  object-fit: cover;
  border-radius: 6px;
  flex-shrink: 0;
}

.preview-placeholder {
  width: 100px;
  height: 64px;
  border-radius: 6px;
  background-color: #f5f5f5;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.preview-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.preview-title {
  font-size: 15px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 统计 */
.stats-overview {
  padding: 8px 0;
}

/* 二维码 */
.qr-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.qr-image {
  width: 250px;
  height: 250px;
  border: 1px solid #e0e0e6;
  border-radius: 8px;
}

.share-url-input {
  width: 100%;
}
</style>
