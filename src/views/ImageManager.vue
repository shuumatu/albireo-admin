<template>
  <n-flex vertical style="padding: 0 32px;">
        <n-flex justify="space-between" align="center" class="mb-4" style="width: 100%;">
          <n-flex align="center">
            <h2>图片管理</h2>
          </n-flex>  
          <n-flex justify="flex-end" align="center" :wrap="false">
            <n-select
              v-model:value="filterType"
              clearable
              placeholder="全部类型"
              style="width: 140px;"
              :options="[
                { label: '照片', value: 'photo' },
                { label: '封面', value: 'cover' },
                { label: '其他', value: 'other' },
              ]"
              @update:value="() => { page = 1; fetchPageData() }"
              @clear="() => { page = 1; fetchPageData() }"
            />
            <n-tooltip trigger="hover">
              <template #trigger>
                <n-button @click="toggleView">
                  <n-icon v-if="viewMode === 'list'" :component="GridOutline" size="30" color="#3cd56f" />
                  <n-icon v-else :component="List20Filled" size="30" color="#3cd56f" />
                </n-button>
              </template>
              切换视图
            </n-tooltip>
          </n-flex>
        </n-flex>
        <n-flex align="center" v-if="!isCollection && !isBatchMode">
          <n-button type="error" @click="startBatchDelete">
            批量删除
          </n-button>
          <n-button strong secondary type="primary" @click="startAddToCollection">
            <n-flex>添加到合集</n-flex>
          </n-button>
        </n-flex>
        <n-flex align="center" v-if="isBatchMode">
          <n-popconfirm
              positive-text="是"
              negative-text="否"
              @positive-click="handleRemoveImages"
            >
            <template #trigger>
              <n-button type="error" :disabled="checkedRowKeys.length === 0">
                确认删除
              </n-button>
            </template>
              是否删除选中的图片？
          </n-popconfirm>
          <n-button @click="cancelBatchMode">
            取消删除
          </n-button>
          <n-button @click="selectAllCurrentPage" :disabled="images.length === 0">
            全选
          </n-button>
          <n-button @click="clearAllSelection" :disabled="checkedRowKeys.length === 0">
            取消全选
          </n-button>
        </n-flex>
        <n-flex v-if="isCollection" class="collection-area" justify="space-between"> 
          <n-flex align="center" style="margin-left: 16px;">
            <n-button @click="addCollection">
              加入合集
            </n-button>
            <n-button @click="selectAllCurrentPage" :disabled="images.length === 0" style="margin-left: 8px;">
              全选
            </n-button>
            <n-button @click="clearAllSelection" :disabled="checkedRowKeys.length === 0" style="margin-left: 8px;">
              取消全选
            </n-button>
            <a>选择要加入合集的图片</a>
          </n-flex>
          
          <n-flex justify="flex-end" style="margin-right: 16px;">
            <n-button text @click="isCollection = false">
              <n-icon size="20"><CloseOutline /></n-icon>
            </n-button>
          </n-flex>
        
        </n-flex>
        <!-- 详细信息视图 -->
        <n-data-table
        v-if="viewMode === 'list'"
        :columns="columns"
        :data="images"
        :bordered="false"
        :row-key="(row: ImageItem) => row.id"
        v-model:checked-row-keys="checkedRowKeys"
        />
        

        <!-- 大图标视图 -->
         <drag-select
          v-if="viewMode === 'grid' && (isBatchMode || isCollection)"
          v-model="checkedRowKeys"
          multiple
          :clickOptionToSelect="true"
          :toggleKey="['ctrlKey', 'metaKey']"
          :rangeKey="['shiftKey']"
          background="rgba(60, 213, 111, 0.1)"
         >
          <n-grid cols="4" x-gap="16" y-gap="16">
            <n-grid-item v-for="img in images" :key="img.id">
              <drag-select-option :value="img.id">
                <div class="image-card-wrapper">
                  <n-card size="small" hoverable @click="handleCardClick(img, $event)"
                  :class="{ 'selected-card': (isBatchMode || isCollection)&&isCardSelected(img.id) }">
                    <n-flex vertical>
                      <n-flex justify="center" class="image-container">
                        <n-image :src="toMediumUrl(img.imageUrl)" width="100%" height="150px" object-fit="cover"   @click="handleImageClick"
                        :preview-disabled="isBatchMode || isCollection"
                        />
                        <!-- 状态遮罩 -->
                        <div v-if="img.status && img.status !== 'done'" :class="['status-overlay', `status-${img.status}`]">
                          <n-flex vertical align="center" justify="center" style="height: 100%;">
                            <n-spin v-if="img.status === 'uploading' || img.status === 'processing'" size="large" />
                            <span class="status-text">{{ getStatusText(img.status) }}</span>
                            <n-button v-if="img.status === 'failed'" type="error" size="small" @click.stop="handleRetry(img.id)">
                              重试
                            </n-button>
                          </n-flex>
                        </div>
                      </n-flex>
                      <n-flex justify="center">
                      {{ img.fileName }}
                      </n-flex>
                    </n-flex>
                  </n-card>
                </div>
              </drag-select-option>
            </n-grid-item>
          </n-grid>
         </drag-select>
        
         <!-- 普通模式下仅展示网格，不启用拖选 -->
        <n-grid v-else-if="viewMode === 'grid'" cols="4" x-gap="16" y-gap="16">
          <n-grid-item v-for="img in images" :key="img.id">
            <div class="image-card-wrapper">
              <n-card size="small" hoverable @click="handleCardClick(img, $event)">
                <n-flex vertical>
                  <n-flex justify="center" class="image-container">
                    <n-image :src="toMediumUrl(img.imageUrl)" width="100%" height="150px" object-fit="cover"
                      @click="handleImageClick"
                      :preview-disabled="isBatchMode || isCollection"
                    />
                    <!-- 状态遮罩 -->
                    <div v-if="img.status && img.status !== 'done'" :class="['status-overlay', `status-${img.status}`]">
                      <n-flex vertical align="center" justify="center" style="height: 100%;">
                        <n-spin v-if="img.status === 'uploading' || img.status === 'processing'" size="large" />
                        <span class="status-text">{{ getStatusText(img.status) }}</span>
                        <n-button v-if="img.status === 'failed'" type="error" size="small" @click.stop="handleRetry(img.id)">
                          重试
                        </n-button>
                      </n-flex>
                    </div>
                  </n-flex>
                  <n-flex justify="center">
                    {{ img.fileName }}
                  </n-flex>
                </n-flex>
              </n-card>
              <div class="card-action-trigger" @click.stop>
                <n-dropdown trigger="click" :options="getCardActions(img)" @select="(key: string) => handleCardAction(key, img)" placement="bottom-end">
                  <n-button text size="small">
                    <n-icon size="18"><EllipsisVertical /></n-icon>
                  </n-button>
                </n-dropdown>
              </div>
            </div>
          </n-grid-item>
        </n-grid>

        
        <n-flex justify="flex-end" style="width: 100%;">
          <n-pagination
            v-model:page="page"
            v-model:page-size="pageSize"
            :item-count="itemCount"
            show-size-picker
            :page-sizes="[10, 20, 50, 100]"
            @update:page="fetchPageData"
            @update:page-size="fetchPageData"
          />
        </n-flex>
  </n-flex>
  <n-modal v-model:show="showModal" title="图片信息" preset="card" style="width: 40vw;">
    <n-flex vertical>
      <n-image :src="thumbUrl" width="40%" :img-props="{ style: 'margin: 0 auto; display: block;' }"/>
      <n-form :model="modal" label-width="auto">
        <n-form-item label="文件名">
          {{modal.fileName}}
        </n-form-item>
        <n-form-item label="标题">
          <n-input v-model:value="modal.title" placeholder="请输入标题" />
        </n-form-item>
        <n-form-item label="描述">
          <n-input
            v-model:value="modal.description"
            type="textarea"
            placeholder="请输入描述"
          />
        </n-form-item>
        <n-form-item label="类型">
          <n-select
            v-model:value="modal.type"
            :options="[
              { label: '照片', value: 'photo' },
              { label: '封面', value: 'cover' },
              { label: '其他', value: 'other' }
            ]"
            placeholder="请选择类型"
          />
        </n-form-item>
        <n-form-item label="合集"> 
          <n-flex vertical>
            
            <n-flex>
              <n-tag v-for="c in modal.collections || []" :key="c.id" type="info" closable round @close="removeCollection(c.id)">
              {{ c.name }}
              </n-tag>
            </n-flex>
            <n-flex justify="start">
              <n-button text type="primary" @click="openEditCollectionModal">编辑合集</n-button>
            </n-flex>
          </n-flex>
        </n-form-item>
        <n-form-item>
          <n-flex justify="end" style="width: 100%;">
            <n-button type="primary" @click="handleSave">保存</n-button>
            <n-button @click="showModal = false">取消</n-button>
          </n-flex>
        </n-form-item>
      </n-form>
    </n-flex>
  </n-modal>

  <!-- 位置信息弹窗 -->
  <n-modal
    v-model:show="showImageLocationModal"
    title="位置信息"
    preset="card"
    style="width: 60vw;"
    :mask-closable="false"
  >
    <n-flex vertical>
      <div v-if="currentLocationImage" style="margin-bottom: 8px;">
        当前图片：{{ currentLocationImage.title || currentLocationImage.fileName }}
      </div>
      <LocationPicker v-model="imageLocationPoint" height="400px" />
      <n-flex justify="end" style="margin-top: 12px;">
        <n-button @click="showImageLocationModal = false">取消</n-button>
        <n-button type="primary" @click="handleSaveImageLocation">保存位置</n-button>
      </n-flex>
    </n-flex>
  </n-modal>

  <!-- EXIF 信息弹窗 -->
  <n-modal
    v-model:show="showExifModal"
    title="EXIF 摄影元数据"
    preset="card"
    style="width: 50vw;"
    :mask-closable="false"
  >
    <n-flex vertical>
      <div v-if="exifTarget" style="margin-bottom: 8px;">
        当前图片：{{ exifTarget.title || exifTarget.fileName }}
      </div>
      <ExifEditor v-model="exifData" :loading="exifLoading" />
      <n-flex justify="end" style="margin-top: 12px;">
        <n-button @click="showExifModal = false">取消</n-button>
        <n-button type="primary" @click="handleSaveExif" :loading="exifLoading">保存</n-button>
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
    v-model:value="modal.collectionIds"
    :options="collectionOptions"
    source-filterable
  />
  <n-flex justify="end">
    <n-button type="primary" @click="handleSaveCollections">保存</n-button>
  </n-flex>
  </n-flex>
</n-modal>

    <!-- 批量加入合集弹窗 -->
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

</template>

<script setup lang="ts">
import { onMounted, ref ,h, reactive, computed} from 'vue'
import { fetchImages ,deleteImage, updateImage, fetchCollectionsWithImageId, addImagesToCollections, removeImagesFromCollections, fetchImagesWithCollectionId} from '../api/images'
import type { DataTableColumns } from 'naive-ui'
import { NButton, NDropdown, NPopconfirm, useMessage, useDialog, NTag, NSpin, NFlex} from 'naive-ui'
import type { ImageItem, CollectionResponse } from '../api/images'
import {GridOutline, CloseOutline, EllipsisVertical} from '@vicons/ionicons5'
import {List20Filled, CollectionsAdd24Regular} from '@vicons/fluent'
import { fetchImageCollectionsIds } from '../api/manager'
import {useImageManagerStore} from '../stores/imageManager'
import { useCollectionDetailStore } from '../stores/collection'
import { useRoute, useRouter } from 'vue-router'
import LocationPicker from '../components/LocationPicker.vue'
import type { LocationPoint } from '../components/LocationPicker.vue'
import { fetchImageLocation, updateImageLocation } from '../api/location'
import ExifEditor from '../components/ExifEditor.vue'
import type { ExifData } from '../api/exif'
import { fetchImageExif, updateImageExif } from '../api/exif'

const showModal = ref(false)
const imageManagerStore = useImageManagerStore()
const collectionDetailStore = useCollectionDetailStore()

const viewMode = ref<'list' | 'grid'>('list')
const isCollection= ref(false)
const isBatchMode = ref(false) // 批量操作模式
const images = ref<ImageItem[]>([])

const message = useMessage()
const dialog = useDialog()

// 已选中的行 key（这里用 id）
const checkedRowKeys = ref<number[]>([])

const toggleView = () => {
  viewMode.value = viewMode.value === 'list' ? 'grid' : 'list'
}

const page = ref(1)
const pageSize = ref(10)
const itemCount = ref(0) // 总记录数
const filterType = ref<string | null>('photo')
async function fetchPageData() {
  let res
  if(collectionDetailStore.img){
    res=await fetchImagesWithCollectionId(imageManagerStore.collectionId,{ page: page.value, pageSize: pageSize.value })
  }else{
    const params: any = { page: page.value, pageSize: pageSize.value }
    if (filterType.value) params.type = filterType.value
    res = await fetchImages(params)
  }
  // @ts-ignore
  images.value = res.data
  // @ts-ignore
  itemCount.value = res.total
}
const route = useRoute()
const router = useRouter()


onMounted(async () => {
    if(collectionDetailStore.img){
      if (route.path === '/manager/image') {
    collectionDetailStore.img=null
  }
    }
    await fetchPageData();
})
const modal = reactive<ImageItem & { collections: CollectionResponse[] } & { collectionIds: number[] }>({
  id: 0,
  uuid: '',
  fileName: '',
  imageUrl: '',
  title: '',
  description: '',
  type: '',
  status: '',
  collections: [],
  collectionIds: []
})

function parseLocationString(s: string | null | undefined): LocationPoint | null {
  if (s == null || String(s).trim() === '') return null
  const parts = String(s).split(/[,，\s]+/).map((x) => parseFloat(x.trim())).filter((n) => !Number.isNaN(n))
  if (parts.length >= 2) return { lat: parts[0], lng: parts[1] }
  return null
}

const showImageLocationModal = ref(false)
const imageLocationTarget = ref<ImageItem | null>(null)
const imageLocationString = ref('')

const currentLocationImage = computed(() => imageLocationTarget.value)

const imageLocationPoint = computed<LocationPoint | null>({
  get: () => parseLocationString(imageLocationString.value),
  set: (v: LocationPoint | null) => {
    imageLocationString.value = v ? `${v.lat},${v.lng}` : ''
  }
})

const showExifModal = ref(false)
const exifLoading = ref(false)
const exifTarget = ref<ImageItem | null>(null)
const exifData = ref<ExifData>({})

const baseColumns: DataTableColumns<ImageItem> = [
  { title: '文件名', key: 'fileName', width: 300 },
  { title: '标题', key: 'title' },
  { title: '描述', key: 'description' },
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
    title: '操作',
    key: 'actions',
    width: 160,
    render(row) {
      const canEdit = !row.status || row.status === 'done' || row.status === 'pending'
      const isFailed = row.status === 'failed'

      const moreOptions = []
      if (isFailed) {
        moreOptions.push({ label: '重试', key: 'retry' })
      }
      if (canEdit) {
        moreOptions.push(
          { label: '位置信息', key: 'location' },
          { label: 'EXIF信息', key: 'exif' },
          { label: '评论', key: 'comment' }
        )
      }

      const handleMoreSelect = (key: string) => {
        if (key === 'retry') handleRetry(row.id)
        else if (key === 'location') openImageLocationModal(row)
        else if (key === 'exif') openExifModal(row)
        else if (key === 'comment') router.push({ path: '/manager/comment', query: { targetType: 'image', targetId: row.uuid } })
      }

      return h('div', { style: 'display: flex; align-items: center; gap: 6px;' }, [
        canEdit
          ? h(NButton, { size: 'small', onClick: () => handleEdit(row) }, { default: () => '编辑' })
          : null,
        moreOptions.length > 0
          ? h(NDropdown, { trigger: 'click', options: moreOptions, onSelect: handleMoreSelect }, {
              default: () => h(NButton, { size: 'small' }, { default: () => '更多' })
            })
          : null,
        h(
          NPopconfirm,
          { onPositiveClick: () => handleDelete(row.id), positiveText: '删除', negativeText: '取消', showIcon: false },
          {
            default: () => '确认要删除吗？',
            trigger: () => h(NButton, { size: 'small', type: 'error' }, { default: () => '删除' })
          }
        )
      ])
    }
  }
]

// 动态添加 selection 列
const columns = computed(() => {
  return (isCollection.value || isBatchMode.value)
    ? [{ type: 'selection', key: 'selection', width: 40 }, ...baseColumns]
    : baseColumns
})

const originalCollectionIds = ref<number[]>([])


async function handleEdit(row: ImageItem) {
  Object.assign(modal, { ...row })
  const collectionsRes = await fetchCollectionsWithImageId(row.id)
  modal.collections = collectionsRes.data ?? []
  modal.collectionIds = modal.collections.map(c => c.id)
  originalCollectionIds.value = [...modal.collectionIds]

  showModal.value = true
}

function handleImageClick(event: Event) {
  if (!isBatchMode.value&&!isCollection.value) {
    event.stopPropagation();
  }
}
// 处理卡片点击事件
function handleCardClick(img: ImageItem, event: MouseEvent) {
  if (!isBatchMode.value && !isCollection.value) {
    // 普通模式：编辑图片
    handleEdit(img)
  } else {
    // 批量/合集模式交给 drag-select 自己处理
    event.stopPropagation()
  }
}
// 切换图片选择状态
function toggleImageSelection(imageId: number) {
  const index = checkedRowKeys.value.indexOf(imageId)
  if (index > -1) {
    checkedRowKeys.value.splice(index, 1)
  } else {
    checkedRowKeys.value.push(imageId)
  }
}

// 判断图片是否被选中
function isCardSelected(imageId: number): boolean {
  return checkedRowKeys.value.includes(imageId)
}

function selectAllCurrentPage() {
  checkedRowKeys.value = images.value.map(item => item.id)
}

function clearAllSelection() {
  checkedRowKeys.value = []
}

async function handleSave() {
  try{
    // 1. 原合集和新合集（确保都为数字数组）
    const oldIds = originalCollectionIds.value || []
    const newIds = (modal.collectionIds || []).map(id => Number(id))

    // 2. 使用 Set 计算差集（效率好、语义清晰）
    const oldSet = new Set(oldIds)
    const newSet = new Set(newIds)

    const added = newIds.filter(id => !oldSet.has(id))  // 需要加入的合集
    const removed = oldIds.filter(id => !newSet.has(id))  // 需要移除的合集
    
    // 调用你的更新 API，比如 updateImage(modal)
    // 这里假设你有一个 updateImage
    await updateImage(modal.id,{
      title:modal.title, 
      description:modal.description, 
      type:modal.type
    })

    // 4. 根据差集调用合集相关 API（只有非空时才调用）
    if (added.length > 0) {
    // payload 结构根据你后端的接口调整
    await addImagesToCollections({
      imageIds: [modal.id], 
      collectionIds: added
    })
    }
    if (removed.length > 0) {
      await removeImagesFromCollections({
        imageIds: [modal.id], 
        collectionIds: removed
      })
    }




    await fetchPageData();
    message.success('编辑成功')
    showModal.value = false
  }catch(e){
    console.log(e)
    message.error('更新失败')
  }
}

function removeCollection(id: number){
  if (modal.collections) {
    modal.collections = modal.collections.filter(collection => collection.id !== id)
    modal.collectionIds = modal.collectionIds.filter(collectionId => collectionId !== id)
  }
}

async function handleDelete(ids: number | number[]) {
  const idArray = Array.isArray(ids) ? ids : [ids];
  await deleteImage(idArray);
  await fetchPageData();
}

const showEditCollectionModal = ref(false)
const showCollectionModal = ref(false) // 控制"加入合集"模态框显示
const selectedCollection = ref<(number)[]>([]) // 批量加入合集时选中的合集
 // 绑定选中的值
const collectionOptions = ref<{ label: string; value: string | number }[]>([])
async function openEditCollectionModal(){
  const res = await fetchImageCollectionsIds()
  collectionOptions.value = res.map(c => ({
    label: c.name,
    value: c.id
  }))

  // 恢复初始选择
  modal.collectionIds = modal.collections ? modal.collections.map(c => c.id) : []
  showEditCollectionModal.value = true
}

function handleSaveCollections(){
    modal.collections = collectionOptions.value
    .filter(opt => modal.collectionIds.includes(Number(opt.value)))
    .map(opt => ({ id: Number(opt.value), name: opt.label, description: '' }))

  showEditCollectionModal.value = false

}
  
async function handleRemoveImages(){
  if (checkedRowKeys.value.length === 0) {
    message.warning('请先选择要删除的图片')
    return
  }
  
  try {
    if(collectionDetailStore.img){
      const collectionId = imageManagerStore.collectionId;
      if (collectionId === null) {
        message.error('未指定合集ID');
        return;
      }
      await removeImagesFromCollections({
        imageIds: checkedRowKeys.value, 
        collectionIds: [collectionId]
      })
    }else{
      await handleDelete(checkedRowKeys.value)
    }
    await fetchPageData();
    message.success('删除成功')
    checkedRowKeys.value = []
    isBatchMode.value = false
  } catch (err) {
    console.error(err)
    message.error('删除失败')
  }
}


function startAddToCollection(){ 
  isCollection.value=true
}

function startBatchDelete() {
  isBatchMode.value = true
}

function cancelBatchMode() {
  isBatchMode.value = false
}

async function addCollection(){
  try {
    const res = await fetchImageCollectionsIds()
    collectionOptions.value = res.map((item: any) => ({
      label: item.name,
      value: item.id
    }))
  } catch (err) {
    console.error('获取合集失败', err)
    message.error('获取合集失败')
  }
  showCollectionModal.value = true
}

async function handleAddCollection(){
  if(!selectedCollection.value||selectedCollection.value.length===0){
    message.warning('请选择合集')
    return
  }
  if (!checkedRowKeys.value || checkedRowKeys.value.length === 0) {
    message.warning('请选择要加入合集的图片')
    return
  }
  try {
    const payload = {
      collectionIds: selectedCollection.value.map(id => Number(id)), // 选中的合集 id 数组
      imageIds: checkedRowKeys.value.map(id => Number(id))              // 选中的图片 id 数组
    }
    await addImagesToCollections(payload) // 调你后端的 API
    message.success('添加成功')
    await fetchPageData()

    showCollectionModal.value = false
    isCollection.value = false
    isBatchMode.value = false
    checkedRowKeys.value = []
  } catch (err) {
    console.error(err)
    message.error('添加失败')
  }
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
async function handleRetry(imageId: number) {
  try {
    // 这里调用你的重试 API
    // await retryImage(imageId)
    message.info('正在重试上传...')
    
    // 重新获取数据以更新状态
    await fetchPageData()
    message.success('重试成功')
  } catch (err) {
    console.error('重试失败', err)
    message.error('重试失败')
  }
}
const thumbUrl = computed(() => {
  if (!modal.imageUrl) return ''
  return modal.imageUrl.replace(/\/raw\/[^/]+$/, '/medium/medium.jpg')
})

function toMediumUrl(url: string): string {
  return url.replace(/\/raw\/[^/]+$/, '/medium/medium.jpg')
}

function getCardActions(img: ImageItem) {
  const options: any[] = []
  if (img.status === 'failed') {
    options.push({ label: '重试', key: 'retry' })
  }
  if (!img.status || img.status === 'done' || img.status === 'pending') {
    options.push(
      { label: '编辑', key: 'edit' },
      { label: '位置信息', key: 'location' },
      { label: 'EXIF信息', key: 'exif' },
    )
  }
  options.push({ type: 'divider', key: 'd1' })
  options.push({ label: '删除', key: 'delete', props: { style: { color: '#d03050' } } })
  return options
}

function handleCardAction(key: string | number, img: ImageItem) {
  switch (key) {
    case 'edit': handleEdit(img); break
    case 'location': openImageLocationModal(img); break
    case 'exif': openExifModal(img); break
    case 'retry': handleRetry(img.id); break
    case 'delete':
      dialog.warning({
        title: '确认删除',
        content: '确认要删除这张图片吗？',
        positiveText: '删除',
        negativeText: '取消',
        onPositiveClick: () => handleDelete(img.id)
      })
      break
  }
}

function openImageLocationModal(row: ImageItem) {
  imageLocationTarget.value = row
  imageLocationString.value = ''
  showImageLocationModal.value = true

  fetchImageLocation(row.uuid)
    .then((loc) => {
      if (loc) {
        imageLocationString.value = `${loc.latitude},${loc.longitude}`
      } else {
        message.info('该图片尚未配置位置信息')
      }
    })
    .catch(() => {
      message.error('获取位置信息失败')
    })
}

function openExifModal(row: ImageItem) {
  exifTarget.value = row
  exifData.value = {}
  exifLoading.value = true
  showExifModal.value = true

  fetchImageExif(row.uuid)
    .then((data) => {
      if (data) {
        exifData.value = data
      } else {
        message.info('该图片尚无 EXIF 数据，可直接填写')
      }
    })
    .catch(() => {
      message.error('获取 EXIF 信息失败')
    })
    .finally(() => {
      exifLoading.value = false
    })
}

function handleSaveExif() {
  if (!exifTarget.value) {
    showExifModal.value = false
    return
  }

  exifLoading.value = true
  updateImageExif(exifTarget.value.uuid, exifData.value)
    .then(() => {
      message.success('EXIF 信息已更新')
      showExifModal.value = false
    })
    .catch(() => {
      message.error('更新 EXIF 信息失败')
    })
    .finally(() => {
      exifLoading.value = false
    })
}

function handleSaveImageLocation() {
  if (!imageLocationTarget.value) {
    showImageLocationModal.value = false
    return
  }

  const point = imageLocationPoint.value
  if (!point) {
    message.warning('请先在地图上选择位置')
    return
  }

  updateImageLocation(imageLocationTarget.value.uuid, {
    longitude: point.lng,
    latitude: point.lat
  })
    .then(() => {
      message.success('位置信息已更新')
      showImageLocationModal.value = false
    })
    .catch(() => {
      message.error('更新位置信息失败')
    })
}
</script>

<style scoped>
.collection-area {
  height: 50px;
  display: flex;
  align-items: center;            /* 垂直居中 */
  background-color: #d5ffdbc4; /* 浅绿色 */

  width: 100%;
}
.selected-card {
  background-color: #d5ffdbc4 !important; /* 浅绿色背景 */
  border: 2px solid #3cd56f !important; /* 绿色边框 */
  transform: translateY(2px); /* 凹下去的效果 */
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1); /* 内阴影 */
}

.selected-card:hover {
  background-color: #c8f5c8 !important; /* 悬停时稍微深一点的绿色 */
}

/* 图片容器 */
.image-container {
  position: relative;
}

/* 状态遮罩基础样式 */
.status-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  z-index: 10;
}

/* 上传中 - 半透明蓝色 */
.status-uploading {
  background-color: rgba(24, 144, 255, 0.7);
}

/* 待处理 - 半透明灰色 */
.status-pending {
  background-color: rgba(128, 128, 128, 0.7);
}

/* 处理中 - 半透明橙色 */
.status-processing {
  background-color: rgba(250, 140, 22, 0.7);
}

/* 失败 - 半透明红色 */
.status-failed {
  background-color: rgba(255, 77, 79, 0.7);
}

/* 状态文字样式 */
.status-text {
  color: white;
  font-size: 14px;
  font-weight: bold;
  margin-top: 8px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

/* 确保卡片包装器没有额外的定位 */
.image-card-wrapper {
  position: relative;
}

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

.image-card-wrapper:hover .card-action-trigger {
  opacity: 1;
}
</style>