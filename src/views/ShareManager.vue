<template>
  <div class="share-manager-page admin-page">
    <n-card class="page-card">
      <!-- 顶部说明 + 跳转按钮 -->
      <template #header>
        <div class="header admin-page-header">
          <div class="header-left">
            <h1 class="page-title">分享管理</h1>
            <p class="page-subtitle">
              管理你已创建的分享链接。要新建分享，请到
              <n-button text type="primary" @click="goImage">图片</n-button>
              /
              <n-button text type="primary" @click="goVideo">视频</n-button>
              /
              <n-button text type="primary" @click="goCollection">合集</n-button>
              页面，在卡片或详情上点击"分享"。
            </p>
          </div>
          <n-button @click="fetchShares" :loading="loading">
            <template #icon><n-icon :component="RefreshOutline" /></template>
            刷新
          </n-button>
        </div>
      </template>

      <!-- 筛选栏 -->
      <n-flex align="center" :wrap="true" class="filter-bar">
        <n-input
          v-model:value="keyword"
          placeholder="搜索标题 / 描述 / 分享码"
          style="width: min(280px, 100%)"
          aria-label="搜索分享"
          clearable
          @keyup.enter="onFilterChange"
          @clear="onFilterChange"
        >
          <template #prefix><n-icon :component="SearchOutline" /></template>
        </n-input>
        <n-button type="primary" secondary :loading="loading" @click="onFilterChange">搜索</n-button>
        <n-select
          v-model:value="filterType"
          :options="targetTypeFilterOptions"
          placeholder="全部类型"
          style="width: 120px"
          clearable
          @update:value="applyFilters"
        />
        <n-select
          v-model:value="filterStatus"
          :options="statusFilterOptions"
          placeholder="全部状态"
          style="width: 120px"
          clearable
          @update:value="applyFilters"
        />
        <n-button v-if="hasFilters" @click="resetFilters">重置筛选</n-button>
        <span style="flex: 1 1 auto;" />
        <n-text depth="3" v-if="!loading">
          共 {{ totalRaw }} 条{{ hasFilters ? ` · 匹配 ${filteredCount} 条` : '' }}
        </n-text>
      </n-flex>
      <n-alert v-if="loadError" type="error" :bordered="false" class="status-alert">{{ loadError }} <n-button text type="error" @click="fetchShares">重新加载</n-button></n-alert>
      <n-text v-if="loading && hasFilters" depth="3" class="filter-progress" aria-live="polite">正在检索全部分享{{ loadedCount ? `，已读取 ${loadedCount} 条` : '…' }}</n-text>
      <n-data-table
        :columns="columns"
        :data="displayShares"
        :loading="loading"
        :pagination="pagination"
        :remote="true"
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
        :row-key="(row: ShareVO) => row.id"
        :scroll-x="1080"
        :bordered="false"
      ><template #empty><n-empty :description="loadError ? '列表暂时不可用，请重新加载' : hasFilters ? '没有找到匹配的分享，试试调整筛选条件' : '还没有分享，从图片、视频或合集页面创建一个吧'" /></template></n-data-table>
    </n-card>

    <!-- ==================== 编辑分享弹窗 ==================== -->
    <n-modal v-model:show="showEditModal" title="编辑分享" preset="card" style="width: min(540px, calc(100vw - 32px));" :mask-closable="!submitting" :close-on-esc="!submitting" :closable="!submitting">
      <n-form :model="editForm" label-placement="top" :disabled="submitting">
        <n-form-item label="标题">
          <n-input v-model:value="editForm.title" placeholder="留空使用原资源标题" maxlength="80" show-count clearable />
        </n-form-item>
        <n-form-item label="描述">
          <n-input v-model:value="editForm.description" type="textarea" placeholder="可选描述" :rows="2" maxlength="200" show-count />
        </n-form-item>
        <n-form-item label="新密码">
          <n-input v-model:value="editForm.password" type="password" show-password-on="click" placeholder="留空不修改" :disabled="editForm.clearPassword" />
        </n-form-item>
        <n-form-item label="清除密码">
          <n-switch v-model:value="editForm.clearPassword" />
          <n-text depth="3" style="margin-left: 12px; font-size: 12px;">开启后将移除密码保护</n-text>
        </n-form-item>
        <n-form-item label="过期时间">
          <n-flex align="center" style="width: 100%;">
            <n-date-picker
              v-model:value="editExpireTs"
              type="datetime"
              clearable
              style="flex: 1 1 auto;"
              :disabled="editForm.clearExpiresAt"
            />
            <n-checkbox v-model:checked="editForm.clearExpiresAt">设为永久</n-checkbox>
          </n-flex>
        </n-form-item>
        <n-form-item label="最大访问次数">
          <n-flex align="center" style="width: 100%;">
            <n-input-number
              v-model:value="editForm.maxViews"
              placeholder="不限制"
              style="flex: 1 1 auto;"
              :min="1"
              :precision="0"
              :show-button="false"
              :disabled="editForm.clearMaxViews"
            />
            <n-checkbox v-model:checked="editForm.clearMaxViews">不限制</n-checkbox>
          </n-flex>
        </n-form-item>
      </n-form>
      <template #action>
        <n-space justify="end">
          <n-button :disabled="submitting" @click="showEditModal = false">取消</n-button>
          <n-button type="primary" @click="handleUpdate" :loading="submitting">保存</n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- ==================== 统计弹窗 ==================== -->
    <n-modal v-model:show="showStatsModal" title="访问统计" preset="card" style="width: min(720px, calc(100vw - 32px));">
      <n-spin :show="statsLoading">
        <n-alert v-if="statsError" type="error" :bordered="false">统计加载失败。<n-button text type="error" @click="openStatsModal(statsId)">重试</n-button></n-alert>
        <n-skeleton v-if="statsLoading" height="180px" />
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
          <n-data-table v-else :columns="accessColumns" :data="stats.recentAccess" :pagination="false" size="small" :max-height="300" :scroll-x="550" />
        </template>
      </n-spin>
    </n-modal>

    <!-- ==================== 二维码 / 链接弹窗 ==================== -->
    <n-modal v-model:show="showQRModal" title="分享链接" preset="card" style="width: min(420px, calc(100vw - 32px));">
      <div class="qr-container">
        <n-empty v-if="qrError" description="二维码暂时无法加载，可复制下方链接"><template #extra><n-button size="small" @click="retryQR">重试</n-button></template></n-empty>
        <img v-else :src="qrCodeUrl" alt="分享二维码" class="qr-image" @error="qrError = true" />
        <n-input :value="currentShareUrl" readonly class="share-url-input">
          <template #suffix>
            <n-button text aria-label="复制分享链接" @click="copyUrl(currentShareUrl)">
              <template #icon><n-icon :component="CopyOutline" /></template>
            </n-button>
          </template>
        </n-input>
        <n-text depth="3" style="font-size: 12px; text-align: center;">
          扫描二维码或复制链接分享给他人
        </n-text>
      </div>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, h, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import {
  NCard, NButton, NIcon, NInput, NSelect, NDataTable, NFlex, NText,
  NModal, NForm, NFormItem, NDatePicker, NInputNumber, NSwitch, NCheckbox,
  NSpace, NSpin, NGrid, NGi, NStatistic, NDivider, NH4, NEmpty,
  NDropdown, NTag, NPopconfirm, NAlert, NSkeleton,
  useMessage,
  type DataTableColumns
} from 'naive-ui'
import {
  CopyOutline, RefreshOutline, SearchOutline
} from '@vicons/ionicons5'
import {
  getMyShares,
  updateShare,
  updateShareStatus,
  deleteShare,
  getShareStats,
  getShareQRCodeUrl,
  type ShareVO,
  type ShareUpdateDTO,
  type ShareStatsVO,
  type ShareTargetType,
  type ShareStatus
} from '../api/share'

const message = useMessage()
const router = useRouter()

// ==================== 列表数据 ====================
const shareList = ref<ShareVO[]>([])
const loading = ref(false)
const sharePage = ref(1)
const sharePageSize = ref(20)
const totalRaw = ref(0)
const loadError = ref('')
const loadedCount = ref(0)
const allShares = ref<ShareVO[] | null>(null)
const busyIds = ref(new Set<number>())
let listRequestId = 0

const keyword = ref('')
const appliedKeyword = ref('')
const filterType = ref<ShareTargetType | null>(null)
const filterStatus = ref<ShareStatus | null>(null)

const targetTypeFilterOptions = [
  { label: '视频', value: 'video' },
  { label: '图片', value: 'image' },
  { label: '合集', value: 'collection' }
]

const statusFilterOptions = [
  { label: '生效中', value: 'active' },
  { label: '已过期', value: 'expired' },
  { label: '已停用', value: 'disabled' }
]

// The API only supports pagination. Read pages sequentially when filtering so
// matches are complete, and discard results superseded by a new request.
const hasFilters = computed(() => !!(appliedKeyword.value || filterType.value || filterStatus.value))
const filteredShares = computed(() => {
  let list = allShares.value ?? []
  if (filterType.value) list = list.filter(s => s.targetType === filterType.value)
  if (filterStatus.value) list = list.filter(s => s.status === filterStatus.value)
  const kw = appliedKeyword.value.toLocaleLowerCase()
  if (kw) list = list.filter(s => [s.title, s.description, s.shareCode].some(value => (value || '').toLocaleLowerCase().includes(kw)))
  return list
})
const filteredCount = computed(() => filteredShares.value.length)
const displayShares = computed(() => hasFilters.value
  ? filteredShares.value.slice((sharePage.value - 1) * sharePageSize.value, sharePage.value * sharePageSize.value)
  : shareList.value)
const pagination = computed(() => ({
  page: sharePage.value, pageSize: sharePageSize.value,
  itemCount: hasFilters.value ? filteredCount.value : totalRaw.value,
  showSizePicker: true, pageSizes: [10, 20, 50], pageSlot: 5,
  prefix: ({ itemCount }: { itemCount?: number }) => `共 ${itemCount ?? 0} 条`
}))

async function fetchShares() {
  const current = ++listRequestId
  const filtering = hasFilters.value
  loading.value = true
  loadError.value = ''
  loadedCount.value = 0
  try {
    if (filtering) {
      const rows: ShareVO[] = []
      const batchSize = 200
      let nextPage = 1
      let total = 0
      do {
        const res = await getMyShares(nextPage, batchSize)
        if (current !== listRequestId) return
        total = res.total
        rows.push(...res.data)
        loadedCount.value = rows.length
        if (!res.data.length) break
        nextPage++
      } while ((nextPage - 1) * batchSize < total)
      allShares.value = Array.from(new Map(rows.map(row => [row.id, row])).values())
      totalRaw.value = total
      sharePage.value = Math.min(sharePage.value, Math.max(1, Math.ceil(filteredCount.value / sharePageSize.value)))
    } else {
      const res = await getMyShares(sharePage.value, sharePageSize.value)
      if (current !== listRequestId) return
      shareList.value = res.data
      totalRaw.value = res.total
      const lastPage = Math.max(1, Math.ceil(res.total / sharePageSize.value))
      if (sharePage.value > lastPage) { sharePage.value = lastPage; await fetchShares() }
    }
  } catch {
    if (current === listRequestId) {
      loadError.value = '分享加载失败，请检查网络后重试。'
      shareList.value = []; allShares.value = null
    }
  } finally { if (current === listRequestId) loading.value = false }
}
function onFilterChange() { appliedKeyword.value = keyword.value.trim(); applyFilters() }
function applyFilters() {
  sharePage.value = 1
  if (!hasFilters.value || !allShares.value || loading.value) void fetchShares()
}
function resetFilters() {
  keyword.value = ''; appliedKeyword.value = ''; filterType.value = null; filterStatus.value = null
  sharePage.value = 1
  void fetchShares()
}
function handlePageChange(page: number) { sharePage.value = page; if (!hasFilters.value) void fetchShares() }
function handlePageSizeChange(size: number) { sharePageSize.value = size; sharePage.value = 1; if (!hasFilters.value) void fetchShares() }

// ==================== 编辑 ====================
const showEditModal = ref(false)
const editingId = ref(0)
const editExpireTs = ref<number | null>(null)
const editForm = ref({
  title: '',
  description: '',
  password: '',
  clearPassword: false,
  clearExpiresAt: false,
  clearMaxViews: false,
  maxViews: null as number | null
})
const submitting = ref(false)

function openEditModal(row: ShareVO) {
  editingId.value = row.id
  editForm.value = {
    title: row.title || '',
    description: row.description || '',
    password: '',
    clearPassword: false,
    clearExpiresAt: false,
    clearMaxViews: false,
    maxViews: row.maxViews
  }
  editExpireTs.value = row.expiresAt ? new Date(row.expiresAt).getTime() : null
  showEditModal.value = true
}

/**
 * 三态字段处理：
 * - 想保留：什么都不传（undefined）
 * - 想改值：传新值
 * - 想清空：传 clearXxx=true
 *
 * 普通字符串：空串 vs undefined 在后端被区别对待——这里把空串当作"清空标题"
 * 显式发出，让用户能从 UI 把标题改回空。
 */
async function handleUpdate() {
  if (submitting.value) return
  const payload: ShareUpdateDTO = {}

  payload.title = editForm.value.title.trim()
  payload.description = editForm.value.description.trim()

  if (editForm.value.clearPassword) {
    payload.clearPassword = true
  } else if (editForm.value.password) {
    payload.password = editForm.value.password
  }

  if (editForm.value.clearExpiresAt) {
    payload.clearExpiresAt = true
  } else if (editExpireTs.value) {
    if (editExpireTs.value <= Date.now()) {
      message.warning('过期时间需晚于当前时间')
      return
    }
    payload.expiresAt = new Date(editExpireTs.value).toISOString()
  }

  if (editForm.value.clearMaxViews) {
    payload.clearMaxViews = true
  } else if (editForm.value.maxViews && editForm.value.maxViews > 0) {
    payload.maxViews = editForm.value.maxViews
  }

  submitting.value = true
  try {
    await updateShare(editingId.value, payload)
    message.success('更新成功')
    showEditModal.value = false
    allShares.value = null
    await fetchShares()
  } catch (e: any) {
    message.error(e?.response?.data?.message || '更新失败')
  } finally {
    submitting.value = false
  }
}

// ==================== 启用 / 停用 ====================
async function handleToggleStatus(row: ShareVO) {
  if (busyIds.value.has(row.id)) return
  // expired 不允许直接转 active：先用 update 解除限制后再启用，更直观
  if (row.status === 'expired') {
    message.info('过期分享请先编辑取消过期时间或访问次数限制再启用')
    return
  }
  const next = row.status === 'active' ? 'disabled' : 'active'
  busyIds.value.add(row.id)
  try {
    await updateShareStatus(row.id, next)
    message.success(next === 'active' ? '已启用' : '已停用')
    allShares.value = null
    await fetchShares()
  } catch (e: any) {
    message.error(e?.response?.data?.message || '操作失败')
  } finally { busyIds.value.delete(row.id) }
}

// ==================== 删除 ====================
async function handleDelete(id: number) {
  if (busyIds.value.has(id)) return false
  busyIds.value.add(id)
  try {
    await deleteShare(id)
    message.success('删除成功')
    // 删完最后一条且不是首页时回退一页，避免空白页
    if (displayShares.value.length === 1 && sharePage.value > 1) {
      sharePage.value -= 1
    }
    allShares.value = null
    await fetchShares()
  } catch {
    message.error('删除失败')
    return false
  } finally { busyIds.value.delete(id) }
}

// ==================== 统计 ====================
const showStatsModal = ref(false)
const statsLoading = ref(false)
const stats = ref<ShareStatsVO | null>(null)
const statsId = ref(0)
const statsError = ref(false)
let statsRequestId = 0

async function openStatsModal(id: number) {
  const current = ++statsRequestId
  statsId.value = id
  statsError.value = false
  stats.value = null
  showStatsModal.value = true
  statsLoading.value = true
  try {
    const result = await getShareStats(id)
    if (current === statsRequestId) stats.value = result
  } catch {
    if (current === statsRequestId) statsError.value = true
  } finally {
    if (current === statsRequestId) statsLoading.value = false
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

// ==================== 二维码 / 复制 ====================
const showQRModal = ref(false)
const qrCodeUrl = ref('')
const qrError = ref(false)
const currentShareCode = ref('')
const currentShareUrl = ref('')

function showQR(share: ShareVO) {
  qrError.value = false
  currentShareCode.value = share.shareCode
  qrCodeUrl.value = getShareQRCodeUrl(share.shareCode)
  currentShareUrl.value = share.shareUrl
  showQRModal.value = true
}

function retryQR() { qrError.value = false; qrCodeUrl.value = getShareQRCodeUrl(currentShareCode.value) }

/**
 * 复制到剪贴板，HTTPS 环境用 Clipboard API，否则降级 execCommand。
 * 与 ShareDialog 中的实现保持一致。
 */
async function copyUrl(url: string) {
  if (!url) return
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(url)
      message.success('链接已复制')
      return
    } catch {
      // 失败会落到下面的兜底分支
    }
  }
  try {
    const textarea = document.createElement('textarea')
    textarea.value = url
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    if (ok) {
      message.success('链接已复制')
    } else {
      message.warning('复制失败，请手动复制链接')
    }
  } catch {
    message.warning('复制失败，请手动复制链接')
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

function statusType(status: string) {
  const map: Record<string, 'success' | 'warning' | 'error'> = {
    active: 'success',
    expired: 'warning',
    disabled: 'error'
  }
  return map[status] || 'default'
}

function statusLabel(status: string) {
  const map: Record<string, string> = { active: '生效中', expired: '已过期', disabled: '已停用' }
  return map[status] || status
}

function goImage() { router.push('/manager/image') }
function goVideo() { router.push('/manager/video') }
function goCollection() { router.push('/manager/collection') }

// ==================== 列定义 ====================
const columns = computed<DataTableColumns<ShareVO>>(() => [
  {
    title: '标题',
    key: 'title',
    minWidth: 190,
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
    width: 90,
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
    width: 200,
    fixed: 'right',
    render(row) {
      const moreOptions = [
        { label: '复制链接', key: 'copy' },
        { label: '查看二维码', key: 'qr' },
        { label: '访问统计', key: 'stats' },
        { type: 'divider', key: 'd1' },
        {
          label: row.status === 'active' ? '停用' : '启用',
          key: 'toggle',
          disabled: row.status === 'expired'
        }
      ]
      const handleMoreSelect = (key: string) => {
        if (key === 'copy') copyUrl(row.shareUrl)
        else if (key === 'qr') showQR(row)
        else if (key === 'stats') openStatsModal(row.id)
        else if (key === 'toggle') handleToggleStatus(row)
      }
      return h('div', { style: 'display: flex; align-items: center; gap: 6px;' }, [
        h(NButton, { size: 'small', disabled: busyIds.value.has(row.id), onClick: () => openEditModal(row) }, { default: () => '编辑' }),
        h(NDropdown, { trigger: 'click', options: moreOptions, onSelect: handleMoreSelect }, {
          default: () => h(NButton, { size: 'small', disabled: busyIds.value.has(row.id) }, { default: () => '更多' })
        }),
        h(NPopconfirm, {
          onPositiveClick: () => handleDelete(row.id),
          positiveText: '删除',
          negativeText: '取消'
        }, {
          default: () => '确认删除此分享？访问日志也将一同清除。',
          trigger: () => h(NButton, { size: 'small', type: 'error', secondary: true, loading: busyIds.value.has(row.id) }, { default: () => '删除' })
        })
      ])
    }
  }
])

onBeforeUnmount(() => { listRequestId++; statsRequestId++ })

onMounted(() => {
  fetchShares()
})
</script>

<style scoped>
.share-manager-page {
  min-width: 0;
}

.page-card {
  width: 100%;
  border-radius: 14px;
}

.header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.header-left {
  flex: 1 1 auto;
  min-width: 0;
}

.page-title {
  font-size: 26px;
  font-weight: 700;
  margin: 0 0 4px;
}

.page-subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--n-text-color-3, #999);
  line-height: 1.6;
}

.page-subtitle :deep(.n-button) {
  padding: 0 4px;
}

.filter-bar {
  margin-bottom: 16px;
  margin-top: 4px;
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
  gap: 14px;
}

.qr-image {
  width: 240px;
  height: 240px;
  border: 1px solid var(--n-border-color, #e0e0e6);
  border-radius: 8px;
  background: #fff;
}

.share-url-input {
  width: 100%;
}
.status-alert { margin-bottom: 16px; }
.filter-progress { display: block; margin-bottom: 14px; }
@media (max-width: 640px) { .header { flex-wrap: wrap; }.filter-bar :deep(.n-input) { width: 100% !important; }.qr-image { width: min(240px, 100%); height: auto; aspect-ratio: 1; } }
</style>





