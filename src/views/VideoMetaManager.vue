<template>
  <div class="p-8">
    <n-card title="视频元数据管理" class="max-w-5xl mx-auto">
      <div class="function-area" >
        
        <div>
          <n-button type="error" v-if="!isDeleting&&!isCollection" @click="startDelete">批量删除</n-button>
          <n-button v-if="isDeleting" @click="confirmDelete" style="margin-right: 16px;">确认删除</n-button>
          <n-button v-if="isDeleting" @click="cancelDeleteMode">取消删除</n-button>
        </div>
        <div>
          <n-button strong secondary type="info" @click="startCollection"
          v-if="!isCollection&&!isDeleting">
            添加到合集
          </n-button>
        </div>
      </div>
      <div v-if="isCollection" class="collection-area">
        <div class="left">
          <n-button @click="addCollection">
            加入合集
          </n-button>
          <a>选择要加入合集的视频</a>
        </div>
        <div class="right">
          <n-button text @click="isCollection = false">
            <n-icon size="20"><CloseOutline /></n-icon>
          </n-button>
        </div>
      </div>

      <n-data-table
        remote
        :columns="columns"
        :data="videoList"
        :pagination="pagination"
        :bordered="false"
        :row-key="(row: VideoItem) => row.id"
        :checked-row-keys="selectedKeys"
        @update:checked-row-keys="handleSelectionChange"
        :loading="loading"
        :row-props="rowProps"
      />
    </n-card>

    <!-- 编辑弹窗 -->
    <n-modal v-model:show="showModal" title="视频元数据" preset="card" style="width: 60vw;"
    :mask-closable="false"
    :draggable="{ bounds: 'none' }">
      <n-form :model="form" :rules="rules" ref="formRef" label-width="80">
        <n-form-item label="标题" path="title">
          <n-input v-model:value="form.title" placeholder="请输入标题" />
        </n-form-item>
        <n-form-item label="描述" path="description">
          <n-input v-model:value="form.description" placeholder="请输入描述" type="textarea" />
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
    <n-modal v-model:show="showCollectionModal" title="加入合集" preset="card" style="width: 40vw;"
      :mask-closable="false">
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
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, h, computed, onMounted } from 'vue'
import {
  NButton,
  useMessage,
  useLoadingBar,
  type FormInst,
  type DataTableColumns,
  NPopconfirm,
  NTag,
  NSpin,
  NFlex
} from 'naive-ui'
import { fetchVideoList,fetchCollectionsIds,addVideosToCollections, deleteVideos, updateVideo, removeVideosFromCollections} from '../api/manager'
import type { VideoListResponse } from '../api/manager'
import { CloseOutline } from '@vicons/ionicons5'
import {CollectionsAdd24Regular} from '@vicons/fluent'
import { useCollectionStore } from '../stores/collection'
import { useRoute } from 'vue-router'
import {
  fetchTagsWithVideoId,
  fetchTags as fetchAllTags,
  addTagsToVideo,
  removeTagsFromVideo,
  createTag
} from '../api/tags'
import LocationPicker from '../components/LocationPicker.vue'
import type { LocationPoint } from '../components/LocationPicker.vue'
import { fetchVideoLocation, updateVideoLocation } from '../api/location'
const collectionStore = useCollectionStore()

function parseLocationString(s: string | null | undefined): LocationPoint | null {
  if (s == null || String(s).trim() === '') return null
  const parts = String(s).split(/[,，\s]+/).map((x) => parseFloat(x.trim())).filter((n) => !Number.isNaN(n))
  if (parts.length >= 2) return { lat: parts[0], lng: parts[1] }
  return null
}

const loadingBar = useLoadingBar()

// 类型定义
type RowKey = string | number
interface VideoItem {
  id: number
  uuid: string
  title: string | null
  description: string | null
  location: string | null
  shootTime: string | null
  fileName: string
  objectKey: string
  presignUrl: string
  videoUrl: string
  coverUrl: string | null
  status?: 'uploading' | 'pending' | 'processing' | 'done' | 'failed' | null
  visibility: string | null
  createdAt: string
  updatedAt: string
  collections: { id: number; name: string; description: string }[]|null
}

const originalCollectionIds = ref<number[]>([])
const message = useMessage()

// 视频数据
const videoList = ref<VideoItem[]>([])
const loading = ref(false)
const total = ref(0)

// 分页状态
const currentPage = ref(1)
const pageSize = ref(10)

// 分页配置
const pagination = computed(() => ({
  page: currentPage.value,
  pageSize: pageSize.value,
  itemCount: total.value,
  showSizePicker: true,
  pageSizes: [10, 20, 50, 100],
  onChange: (page: number) => {
    currentPage.value = page
    loadVideoList()
  },
  onUpdatePageSize: (size: number) => {
    pageSize.value = size
    currentPage.value = 1
    loadVideoList()
  }
}))

// 加载数据
async function loadVideoList() {
  loading.value = true
  try {
    const params: any = {
      page: currentPage.value,
      pageSize: pageSize.value,
      collectionId: collectionStore.activeCollectionId == null 
      ? 0
      : collectionStore.activeCollectionId
    }
    const response = await fetchVideoList(params) as unknown as VideoListResponse

    if (response && response.data && Array.isArray(response.data)) {
      total.value = response.total ?? 0
      videoList.value = response.data
    } else {
      console.error('Raw response:', response)
      throw new Error('API 返回格式不正确')
    }

    message.success('数据加载成功')
  } catch (error) {
    console.error('加载失败:', error)
    message.error('数据加载失败')
    videoList.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

const route = useRoute()

onMounted(() => {
  if (route.path === '/manager/video') {
    collectionStore.setCollection(0)
  }
  loadVideoList()
})

const selectedCollection = ref<(number)[]>([])
const collectionOptions = ref<{ label: string; value: string | number }[]>([])

const isCollection = ref(false)

function startCollection(){
  isCollection.value = true
}

const showCollectionModal = ref(false)

const showLocationModal = ref(false)
const locationTarget = ref<VideoItem | null>(null)
const locationString = ref('')

const currentLocationVideo = computed(() => locationTarget.value)

const locationPointForModal = computed<LocationPoint | null>({
  get: () => parseLocationString(locationString.value),
  set: (v: LocationPoint | null) => {
    locationString.value = v ? `${v.lat},${v.lng}` : ''
  }
})

async function addCollection(){
  loadingBar.start()
  try {
    const res = await fetchCollectionsIds()
    collectionOptions.value = res.map((item: any) => ({
      label: item.name,
      value: item.id
    }))
    loadingBar.finish()
  } catch (err) {
    console.error('获取合集失败', err)
    loadingBar.error()
  }
  showCollectionModal.value = true
}

async function handleAddCollection(){
  if(!selectedCollection.value||selectedCollection.value.length===0){
    message.warning('请选择合集')
    return
  }
  if (!selectedKeys.value || selectedKeys.value.length === 0) {
    message.warning('请选择要加入合集的视频')
    return
  }
  try {
    const payload = {
      collectionIds: selectedCollection.value.map(id => Number(id)),
      videoIds: selectedKeys.value.map(id => Number(id))
    }
    await addVideosToCollections(payload)
    message.success('添加成功')
    await loadVideoList()

    showCollectionModal.value = false
    isCollection.value = false
    selectedKeys.value = []
  } catch (err) {
    console.error(err)
    message.error('添加失败')
  }
}

function openLocationModal(row: VideoItem) {
  locationTarget.value = row
  locationString.value = row.location || ''
  showLocationModal.value = true

  // 打开时从后端查询最新位置（如果已配置）
  fetchVideoLocation(row.uuid)
    .then((loc) => {
      if (loc) {
        // 字符串统一保存为「纬度,经度」，内部再转换为 LocationPoint
        locationString.value = `${loc.latitude},${loc.longitude}`
      } else if (!row.location) {
        // 未配置位置且本地也没有，提示一次
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
    latitude: point.lat
  })
    .then(() => {
      const id = locationTarget.value!.id
      const idx = videoList.value.findIndex(v => v.id === id)
      const locationStr = `${point.lat},${point.lng}`
      if (idx !== -1) {
        videoList.value[idx] = {
          ...videoList.value[idx],
          location: locationStr
        }
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

// 删除模式与选中 ID
const isDeleting = ref(false)
const selectedKeys = ref<RowKey[]>([])

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
    await deleteVideos(selectedKeys.value.map(id => Number(id)))
    videoList.value = videoList.value.filter(v => !selectedKeys.value.includes(v.id))
    message.success('删除成功')
  }catch (err) {
    console.error(err)
    message.error('删除失败')
  }finally {
    selectedKeys.value = []
    isDeleting.value = false
  }
}

function handleSelectionChange(keys: RowKey[]) {
  selectedKeys.value = keys
}

// 获取状态文本
function getStatusText(status: string): string {
  const statusMap: Record<string, string> = {
    uploading: '上传中',
    pending: '待处理',
    processing: '处理中',
    failed: '上传失败'
  }
  return statusMap[status] || ''
}

// 处理重试
async function handleRetry(videoId: number) {
  try {
    // 这里调用你的重试 API
    // await retryVideo(videoId)
    message.info('正在重试上传...')
    
    // 重新获取数据以更新状态
    await loadVideoList()
    message.success('重试成功')
  } catch (err) {
    console.error('重试失败', err)
    message.error('重试失败')
  }
}

// 表格列
const baseColumns: DataTableColumns<VideoItem> = [
  {
    title: '序号',
    key: 'index',
    width: 60,
    render: (_row: any, index: number) => {
      return index + 1
    }
  },
  { title: '标题', key: 'title', render: (row) => row.title || '-' },
  { 
    title: '描述', 
    key: 'description', 
    render: (row) => row.description || '-',
    ellipsis: {
      tooltip: true
    }
  },
  { title: '文件名', key: 'fileName' },
  {
    title: '合集',
    key: 'collections',
    render: (row) => {
      if (!row.collections || row.collections.length === 0) {
        return '-'
      }
      return row.collections.map(c => c.name).join(', ')
    }
  },
  {
    title: '状态',
    key: 'status',
    width: 150,
    render(row) {
      if (!row.status || row.status === 'done') {
        return h(
          NTag,
          { type: 'success', size: 'small' },
          { default: () => '完成' }
        )
      }
      
      const statusConfig: Record<string, { type: any; text: string; showSpin: boolean }> = {
        uploading: { type: 'info', text: '上传中', showSpin: true },
        pending: { type: 'default', text: '待处理', showSpin: false },
        processing: { type: 'warning', text: '处理中', showSpin: true },
        failed: { type: 'error', text: '上传失败', showSpin: false }
      }
      
      const config = statusConfig[row.status] || { type: 'default', text: row.status, showSpin: false }
      
      return h(
        NFlex,
        { align: 'center', size: 'small' },
        {
          default: () => [
            config.showSpin ? h(NSpin, { size: 'small', style: { marginRight: '4px' } }) : null,
            h(
              NTag,
              { type: config.type, size: 'small' },
              { default: () => config.text }
            )
          ]
        }
      )
    }
  },
  {
    title: '创建时间',
    key: 'createdAt',
    render: (row) => new Date(row.createdAt).toLocaleString('zh-CN')
  },
  {
    title: '操作',
    key: 'actions',
    render(row) {
      const buttons = []
      
      // 如果状态是失败，显示重试按钮
      if (row.status === 'failed') {
        buttons.push(
          h(
            NButton,
            {
              size: 'small',
              type: 'warning',
              style: { marginRight: '8px' },
              onClick: () => handleRetry(row.id)
            },
            { default: () => '重试' }
          )
        )
      }
      
      // 只有完成状态才能编辑
      if (!row.status || row.status === 'done'|| row.status === 'pending') {
        buttons.push(
          h(
            NButton,
            {
              size: 'small',
              style: { marginRight: '8px' },
              onClick: () => openEditModal(row)
            },
            { default: () => '编辑' }
          )
        )

        buttons.push(
          h(
            NButton,
            {
              size: 'small',
              style: { marginRight: '8px' },
              onClick: () => openLocationModal(row)
            },
            { default: () => '位置信息' }
          )
        )
      }
      
      // 删除按钮
      buttons.push(
        h(
          NPopconfirm,
          {
            onPositiveClick: () => handleDelete(row.id),
            positiveText: '删除',
            negativeText: '取消',
            showIcon: false
          },
          {
            default: () => '确认要删除吗？',
            trigger: () =>
              h(
                NButton,
                {
                  size: 'small',
                  type: 'error'
                },
                { default: () => '删除' }
              )
          }
        )
      )
      
      return buttons
    }
  }
]

// 行双击打开视频
function openVideo(row: VideoItem) {
  const url = "http://localhost:5174/video/"+row.uuid
  if (!url) {
    message.warning('该视频没有可用链接')
    return
  }
  window.open(url, '_blank')
}

// 为每行绑定原生双击事件
function rowProps(row: VideoItem) {
  return {
    onDblclick: () => openVideo(row),
    style: 'cursor: pointer'
  }
}

// 动态添加 selection 列
const columns = computed<DataTableColumns<VideoItem>>(() => {
  return isDeleting.value||isCollection.value
    ? [{ type: 'selection', key: 'selection', width: 40 }, ...baseColumns]
    : baseColumns
})

// 表单与弹窗
const showModal = ref(false)
const formRef = ref<FormInst | null>(null)
const form = reactive<VideoItem& { collectionIds: number[]; tags: { id: number; name: string }[] | null; tagIds: number[] }>({
  id: 0,
  uuid: '',
  title: '',
  description: '',
  location: '',
  shootTime: '',
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
  tagIds: [] as number[]
})

const rules = {
  title: [{ required: true, message: '请输入标题', trigger: 'blur' }]
}

type SimpleTag = { id: number; name: string }

const tagInput = ref('')
const showEditTagModal = ref(false)
const allTagOptions = ref<{ label: string; value: number }[]>([])

function openEditModal(row: VideoItem) {
  Object.assign(form as any, { ...row })
  form.collectionIds = row.collections ? row.collections.map(c => c.id) : []
  originalCollectionIds.value = [...form.collectionIds]
  fetchTagsWithVideoId(row.id).then((tags: SimpleTag[]) => {
    form.tags = tags || []
    form.tagIds = (tags || []).map(t => t.id)
  }).catch(() => {
    form.tags = []
    form.tagIds = []
  })
  showModal.value = true
}

async function handleSubmit() {
  formRef.value?.validate(async (errors) => {
    if (!errors) {
      try{
        const oldIds = originalCollectionIds.value || []
        const newIds = (form.collectionIds || []).map(id => Number(id))
      
        const oldSet = new Set(oldIds)
        const newSet = new Set(newIds)

        const added = newIds.filter(id => !oldSet.has(id))
        const removed = oldIds.filter(id => !newSet.has(id))

        await updateVideo(form.id, { title: form.title ?? '', description: form.description ?? ''})

        if (added.length > 0) {
          await addVideosToCollections({
            collectionIds: added,
            videoIds: [form.id]
          })
        }
        if (removed.length > 0) {
          await removeVideosFromCollections({
            collectionIds: removed,
            videoIds: [form.id]
          })
        }

        await loadVideoList()
        message.success('编辑成功')
        showModal.value = false
      }catch (err) {
        console.error(err)
        message.error('更新失败')
      }
    }
  })
}

const showEditCollectionModal = ref(false)

async function openEditCollectionModal(){
  const res = await fetchCollectionsIds()
  collectionOptions.value = res.map(c => ({
    label: c.name,
    value: c.id
  }))
  form.collectionIds = form.collections ? form.collections.map(c => c.id) : []
  showEditCollectionModal.value = true
}

async function handleDelete(id: number) {
  try {
    await deleteVideos([id])
    videoList.value = videoList.value.filter(v => v.id !== id)
    message.success('删除成功')
  } catch (err) {
    console.error(err)
    message.error('删除失败')
  }
}

function handleSaveCollections(){
  form.collections = collectionOptions.value
    .filter(opt => form.collectionIds.includes(Number(opt.value)))
    .map(opt => ({ id: Number(opt.value), name: opt.label, description: '' }))
  showEditCollectionModal.value = false
}

function removeCollection(id: number) {
  if (form.collections) {
    form.collections = form.collections.filter(collection => collection.id !== id)
    form.collectionIds = form.collectionIds.filter(collectionId => collectionId !== id)
  }
}

async function openEditTagModal() {
  const all = await fetchAllTags()
  allTagOptions.value = (all || []).map((t: any) => ({ label: t.name, value: Number(t.id) }))
  form.tagIds = (form.tags || []).map(t => t.id)
  showEditTagModal.value = true
}

async function handleSaveTags() {
  const oldIds = (form.tags || []).map(t => t.id)
  const newIds = (form.tagIds || []).map(Number)

  const oldSet = new Set(oldIds)
  const newSet = new Set(newIds)

  const added = newIds.filter(id => !oldSet.has(id))
  const removed = oldIds.filter(id => !newSet.has(id))

  if (added.length > 0) {
    await addTagsToVideo({ tagIds: added, videoId: Number(form.id) } )
  }
  if (removed.length > 0) {
    await removeTagsFromVideo({ tagIds: removed, videoId: Number(form.id) } )
  }

  const tags = await fetchTagsWithVideoId(form.id)
  form.tags = tags || []
  form.tagIds = (tags || []).map(t => t.id)

  showEditTagModal.value = false
}

async function removeTag(tagId: number) {
  if (!form.id) return
  await removeTagsFromVideo({ tagIds: [tagId], videoId: Number(form.id) } )
  if (form.tags) {
    form.tags = form.tags.filter(t => t.id !== tagId)
  }
  form.tagIds = form.tagIds.filter(id => id !== tagId)
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
    const result = await createTag({ name })
    console.log('createTag 返回:', result)
    
    if (typeof result === 'string') {
      if (result === '添加失败') {
        throw new Error('标签创建失败')
      }
      
      if (result === '已有同名tag') {
        const allTags = await fetchAllTags()
        const existingTag = allTags.find((t: any) => t.name === name)
        
        if (!existingTag) {
          throw new Error('找不到同名标签')
        }
        
        const tagId = Number(existingTag.id)
        
        if (form.tagIds.includes(tagId)) {
          message.warning('该标签已存在')
          tagInput.value = ''
          return
        }
        
        await addTagsToVideo({ tagIds: [tagId], videoId: Number(form.id) })
        
        if (!form.tags) form.tags = []
        form.tags.push({ id: tagId, name: existingTag.name })
        form.tagIds.push(tagId)
        
        tagInput.value = ''
        message.success('标签添加成功')
        return
      }
      
      if (result === 'tag添加成功') {
        const allTags = await fetchAllTags()
        const newTag = allTags.find((t: any) => t.name === name)
        
        if (!newTag) {
          throw new Error('创建成功但找不到标签')
        }
        
        const tagId = Number(newTag.id)
        
        await addTagsToVideo({ tagIds: [tagId], videoId: Number(form.id) })
        
        if (!form.tags) form.tags = []
        form.tags.push({ id: tagId, name: newTag.name })
        form.tagIds.push(tagId)
        
        tagInput.value = ''
        message.success('标签添加成功')
        return
      }
    }
    
    if (result && typeof result === 'object' && result.id) {
      const tagId = Number(result.id)
      
      if (isNaN(tagId) || tagId <= 0) {
        throw new Error('无效的标签ID')
      }
      
      if (form.tagIds.includes(tagId)) {
        message.warning('该标签已存在')
        tagInput.value = ''
        return
      }
      
      await addTagsToVideo({ tagIds: [tagId], videoId: Number(form.id) })
      
      if (!form.tags) form.tags = []
      form.tags.push({ id: tagId, name: result.name })
      form.tagIds.push(tagId)
      
      tagInput.value = ''
      message.success('标签添加成功')
      return
    }
    
    throw new Error('未知的返回格式')
    
  } catch (error) {
    console.error('操作失败:', error)
    message.error(error instanceof Error ? error.message : '操作失败')
  }
}
</script>

<style scoped>
.function-area {
  display: flex;
  justify-content: space-between;
  margin-bottom: 16px;
}
.collection-area {
  height: 50px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: #f0f9ff;
  margin-bottom: 20px;
}
.collection-area .left {
  margin-left: 15px;
  display: flex;
  justify-content: space-around;
  align-items: center;
}
.collection-area .left a {
  margin-left: 15px;
  font-weight:1000;
  font-size: 18px;
}
.collection-area .right {
  display: flex;
  align-items: center;
  margin-right: 15px;
}
</style>