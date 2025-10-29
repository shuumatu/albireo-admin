<template>
    <n-flex justify="space-between" style="padding: 0 32px;">
      <!-- <n-breadcrumb>
        <n-breadcrumb-item>合集管理</n-breadcrumb-item>
      </n-breadcrumb> -->

      <n-flex>
        <n-input v-model:value="searchKeyword" placeholder="搜索合集..." style="width: 240px" clearable />
        <n-button type="primary" @click="fetchCollectionData">搜索</n-button>
        <n-button type="primary" @click="handleAddCollection">新建合集</n-button>
      </n-flex>
      <n-flex justify="flex-end" >
        <n-button v-if="!img" @click="onChange">图片合集</n-button>
        <n-button v-if="img" @click="onChange">视频合集</n-button>
      </n-flex>
      <n-grid :cols="4" :x-gap="16" :y-gap="16">
        <n-grid-item v-for="item in collections" :key="item.id">
          <n-card :title="item.name" hoverable @click="goDetail(item.id)" style="cursor: pointer;">
            <template #cover>
              <n-flex justify="center" class="cover-wrapper">
                <img
                  v-if="item.coverUrl"
                  :src="item.coverUrl"
                  class="cover-image"
                  alt="cover"
                />
                <n-icon
                  v-else
                  :component="ImageOff24Filled"
                  size="64"
                  color="#ccc"
                  class="cover-placeholder"
                />
              </n-flex>
            </template>
            <div class="text-gray-500">{{ item.description || '暂无描述' }}</div>
            <div class="text-sm text-gray-400">视频数：{{ item.videoCount }}</div>
          </n-card>
        </n-grid-item>
      </n-grid>
      
    </n-flex>

<n-modal v-model:show="showAddCollectionModal" preset="card" style="width: 40vw;" @update:show="handleClose">
  <template #header>
    <n-flex justify="left ">
      <n-icon :component="NoteAdd16Regular" size="45" color="#00af26" />
    </n-flex>
  </template>
  <n-form :model="collectionData">
    <n-form-item label="名称"> 
      <n-input v-model:value="collectionData.name" placeholder="请输入名称" />
    </n-form-item>
    <n-form-item label="描述"> 
      <n-input v-model:value="collectionData.description" placeholder="请输入描述" />
    </n-form-item>
  </n-form>
  <template #action>
    <n-flex justify="flex-end">
      <n-button @click="handleClose">取消</n-button>
      <n-button type="primary" @click="handleSubmit">确定</n-button>
    </n-flex>
  </template>
</n-modal>

</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
import { addImageCollection, addVideoCollection, fetchCollections, fetchImageCollections} from '../api/manager'
import { ImageOff24Filled, NoteAdd16Regular } from '@vicons/fluent'
import {useCollectionDetailStore} from '../stores/collection'


const collectionDetailStore = useCollectionDetailStore()

const message = useMessage()
interface addCollectionItem {
  name: string;
  description: string;
}
const collectionData = ref<addCollectionItem>({
  name: '',
  description: '',
})

const router = useRouter()
const searchKeyword = ref('')
const collections = ref<any[]>([])  // 存储获取到的合集数据

let img = ref(false)


const fetchCollectionData = async () => {
  try {
    collections.value=[]
    let response
    if(img.value){
      response = await fetchImageCollections({
      page: 1,    // 当前页码
      pageSize: 10, // 每页显示的合集数量
      keyword: searchKeyword.value, // 搜索关键词
    })
    }else{
      // 调用 fetchCollections 获取数据，传入分页和搜索关键词
      response = await fetchCollections({
      page: 1,    // 当前页码
      pageSize: 10, // 每页显示的合集数量
      keyword: searchKeyword.value, // 搜索关键词
    })
    }
    


    console.log(response)  // 打印返回的数据格式
    //@ts-ignore
    collections.value = response // 将返回的合集数据保存到 collections 中
  } catch (error) {
    console.error('获取合集数据失败:', error)
  }
}

// 在组件挂载后调用 API 获取数据
onMounted(() => {
  collectionDetailStore.img=img.value
  fetchCollectionData()
})

function onChange(){
  img.value=!img.value
  collectionDetailStore.img=!collectionDetailStore.img
  fetchCollectionData()
}

function goDetail(id: number) {
  router.push(`/manager/collection/${id}`)
}
const showAddCollectionModal = ref(false)
function handleAddCollection(){
  showAddCollectionModal.value=true
}
function handleClose(){
  showAddCollectionModal.value = false
  collectionData.value={
    name:'',
    description:'',
  }
}

async function handleSubmit(){
  try{
    if(img.value){
    await addImageCollection(collectionData.value)
    }else{
      addVideoCollection(collectionData.value)
    }
    fetchCollectionData()
    handleClose()
    message.success('添加成功')
    }catch(err){
      console.error(err)
      message.error('添加失败')
    }
  

}
</script>

<style scoped>
.cover-wrapper {
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: 8px;
  background-color: #f5f5f5; /* 背景占位色，可选 */
  display: flex;
  align-items: center;
  justify-content: center;
}

.cover-image {
  width: 100%;
  height: 100%;
  object-fit: cover; /* 关键：以覆盖形式显示 */
  object-position: center; /* 居中裁剪 */
  display: block;
}

.cover-placeholder {
  width: 64px;
  height: 64px;
  opacity: 0.4;
}
</style>