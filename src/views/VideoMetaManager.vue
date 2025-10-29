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
      </n-form>
      <template #action>
        <n-space>
          <n-button @click="showModal = false">取消</n-button>
          <n-button type="primary" @click="handleSubmit">保存</n-button>
        </n-space>
      </template>
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
  NPopconfirm
} from 'naive-ui'
import { fetchVideoList,fetchCollectionsIds,addVideosToCollections, deleteVideos, updateVideo, removeVideosFromCollections} from '../api/manager'
import type { VideoListResponse } from '../api/manager'
import { CloseOutline } from '@vicons/ionicons5' // 引入关闭图标
import {CollectionsAdd24Regular} from '@vicons/fluent'
import { useCollectionStore } from '../stores/collection'
import { useRoute } from 'vue-router'
const collectionStore = useCollectionStore()


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
  status: string | null
  visibility: string | null
  createdAt: string
  updatedAt: string
  collections: { id: number; name: string; description: string }[]|null
}
// 在组件顶层（script setup）声明一个用于保存编辑前合集 id 的快照
const originalCollectionIds = ref<number[]>([])

const message = useMessage()

// 视频数据
const videoList = ref<VideoItem[]>([])
const loading = ref(false)
const total = ref(0)

// 分页状态
const currentPage = ref(1)
const pageSize = ref(10)

// 分页配置（Naive UI 推荐使用 computed）
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
      // 如果 pinia 里有合集 id，则带上
      collectionId: collectionStore.activeCollectionId == null 
      ? 0 // 显式传“无合集”
      : collectionStore.activeCollectionId

    }
    const response = await fetchVideoList(params) as unknown as VideoListResponse
    // response 已经是后端返回的原始数据: { total: number, data: [] }

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
// 组件挂载时加载数据
onMounted(() => {
  if (route.path === '/manager/video') {
    collectionStore.setCollection(0)
  }
  loadVideoList()
})





// watch(() => route.fullPath, () => {
//   // 合集变更时刷新列表
//   collectionStore.activeCollectionId = 0
//   console.log('route.fullPath', route.fullPath)
//   loadVideoList()
// })
const selectedCollection = ref<(number)[]>([]);
 // 绑定选中的值
const collectionOptions = ref<{ label: string; value: string | number }[]>([])


const isCollection = ref(false)
//开始添加合集
function startCollection(){
  isCollection.value = true
}
//执行加入合集
const showCollectionModal = ref(false) // 控制“加入合集”模态框显示

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
      collectionIds: selectedCollection.value.map(id => Number(id)), // 选中的合集 id 数组
      videoIds: selectedKeys.value.map(id => Number(id))              // 选中的视频 id 数组
    }
    await addVideosToCollections(payload) // 调你后端的 API
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

// 表格列
const baseColumns: DataTableColumns<VideoItem> = [
  {
    title: '序号',
    key: 'index',
    width: 60,
    render: (_row: any, index: number) => {
      return index + 1 // 当前页的第 index + 1 行
    }
  },
  { title: '标题', key: 'title', render: (row) => row.title || '-' },
  { 
    title: '描述', 
    key: 'description', 
    render: (row) => row.description || '-' ,
    ellipsis: {
      tooltip: true // 鼠标悬停显示完整内容
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
      // 显示多个合集名字，用逗号隔开
      return row.collections.map(c => c.name).join(', ')
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
      return [
        h(
          NButton,
          {
            size: 'small',
            style: { marginRight: '8px' },
            onClick: () => openEditModal(row)
          },
          { default: () => '编辑' }
        ),
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
      ]
    }
  }
]

// 行双击打开视频
function openVideo(row: VideoItem) {
  const url = "http://localhost:5173/video/"+row.uuid
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
const form = reactive<VideoItem& { collectionIds: number[] }>({
  id: 0,
  title: '',
  description: '',
  location: '',
  shootTime: '',
  fileName: '',
  objectKey: '',
  presignUrl: '',
  videoUrl: '',
  coverUrl: '',
  status: '',
  visibility: '',
  createdAt: '',
  updatedAt: '',
  collections: null,
  collectionIds: []
})

const rules = {
  title: [{ required: true, message: '请输入标题', trigger: 'blur' }]
}

function openEditModal(row: VideoItem) {
  Object.assign(form, { ...row })
  // 将 collections 转成 id 数组用于选择控件绑定
  form.collectionIds = row.collections ? row.collections.map(c => c.id) : []
  // 保存原始合集 id 快照，稍后提交时用于 diff
  originalCollectionIds.value = [...form.collectionIds]
  showModal.value = true
}

async function handleSubmit() {
  formRef.value?.validate(async (errors) => {
    if (!errors) {
      try{
        // 1. 原合集和新合集（确保都为数字数组）
        const oldIds = originalCollectionIds.value || []
        const newIds = (form.collectionIds || []).map(id => Number(id))
      
        // 2. 使用 Set 计算差集（效率好、语义清晰）
        const oldSet = new Set(oldIds)
        const newSet = new Set(newIds)

        const added = newIds.filter(id => !oldSet.has(id))  // 需要加入的合集
        const removed = oldIds.filter(id => !newSet.has(id))  // 需要移除的合集

        // 3. 先更新视频的基本字段（标题、描述等）
        await updateVideo(form.id, { title: form.title ?? '', description: form.description ?? ''})

        // 4. 根据差集调用合集相关 API（只有非空时才调用）
        if (added.length > 0) {
        // payload 结构根据你后端的接口调整
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

  // 恢复初始选择
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


   // 用 options 匹配到完整的 {id, name} 对象，给 tag 使用
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
  align-items: center;            /* 垂直居中 */
  background-color: #f0f9ff; /* 浅蓝色 */
  margin-bottom: 20px; /* 与下一个区域的间距 */
}
.collection-area .left {
  margin-left: 15px;
  display: flex;
  justify-content: space-around;
  align-items: center;            /* 垂直居中 */

}
.collection-area .left a {
  margin-left: 15px;
  font-weight:1000;
  font-size: 18px;
}
.collection-area .right {
  display: flex;
  align-items: center;            /* 垂直居中 */
  margin-right: 15px;
}

</style>