<template>
  <div class="p-8">
    <!-- 面包屑导航 -->
    <!-- <n-breadcrumb>
      <n-breadcrumb-item @click="goList" style="cursor: pointer;">合集管理</n-breadcrumb-item>
      <n-breadcrumb-item>{{ collection?.name || '加载中...' }}</n-breadcrumb-item>
    </n-breadcrumb> -->

    <!-- 合集基本信息编辑 -->
    <n-card title="合集信息" class="mb-4">
      <n-form :model="collection" label-width="80">
        <n-form-item label="名称">
          <n-input v-model:value="collection.name" />
        </n-form-item>
        <n-form-item label="描述">
          <n-input v-model:value="collection.description" type="textarea" />
        </n-form-item>
    <!-- 创建时间单独展示 -->
        <div class="form-row">
          <span class="font-bold w-20">创建时间</span>
            <n-flex>
              <ShowTime :timeStr="dayjs(collection.createdAt).format('YYYY年MM月DD日 HH:mm:ss')"
              :size="1.1"/>
            </n-flex>
        </div>
            <!-- 封面展示图片 -->
        <n-form-item label="封面">
          <n-flex vertical>
            <n-image
              v-if="collection.imageUrl"
              :src="collection.imageUrl"
              width="200"
              height="120"
              object-fit="cover"
            />
            <span v-else class="text-gray-400">暂无封面</span>
            <n-button type="primary" @click="chooseCover">选择封面</n-button>
          </n-flex>
        </n-form-item>
        <n-space>
          <n-button type="primary" @click="saveCollection">保存</n-button>
        </n-space>
      </n-form>
    </n-card>

    <!-- 视频管理 -->
    <n-card title="合集视频">
      <VideoMetaManager v-if="!collectionDetailStore.img"/>
      <ImageManager v-else />
    </n-card>
  </div>


  <!-- 封面选择弹窗 -->
  <n-modal 
  v-model:show="showCoverModal" 
  title="选择封面" 
  preset="card" 
  style="width: 80vw; height: 80vh;"
  :mask-closable="false"
>
  <div style="height: calc(80vh - 120px);"> <!-- 减去标题和按钮的高度 -->
    <CoverImageSelector 
      @cover-selected="handleCoverSelected"
    />
  </div>
</n-modal>
</template>

<script setup lang="ts">
import { ref, onBeforeMount, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import dayjs from "dayjs";
import VideoMetaManager from "./VideoMetaManager.vue"
import ImageManager from './ImageManager.vue';
import { useCollectionStore, useCollectionDetailStore } from '../stores/collection'
import { fetchCollectionWithCover, fetchImageCollectionWithCover } from '../api/manager';
import { useImageManagerStore } from '../stores/imageManager';
import ShowTime from '../components/ShowTime.vue';
import CoverImageSelector from '../components/CoverImageSelector.vue'
import { saveImageCollection, saveVideoCollection, updateImageCollectionCover, updateVideoCollectionCover } from '../api/collection';
import type { ImageItem } from '../api/images';

const collectionStore = useCollectionStore()
const imageManagerStore = useImageManagerStore()

const collectionDetailStore = useCollectionDetailStore()
const route = useRoute()
const idParam = route.params.id;
const id = Array.isArray(idParam) ? parseInt(idParam[0], 10) : parseInt(idParam as string, 10);


const collection = ref<any>({})



function saveCollection() {
  // TODO: 保存合集信息
  if(collectionDetailStore.img){ 
    saveImageCollection({
      id: collection.value.id,
      name: collection.value.name,
      description: collection.value.description})
  }else{
    saveVideoCollection({
      id: collection.value.id,
      name: collection.value.name,
      description: collection.value.description})
  }
  console.log('保存合集', collection.value)
}
const showCoverModal = ref(false)

function chooseCover(){
  showCoverModal.value = true
}

function handleCoverSelected(image: ImageItem) {
  collection.value.imageUrl = image.imageUrl
  showCoverModal.value = false
  // 调用 API 更新合集封面
  if(collectionDetailStore.img){ 
    updateImageCollectionCover(collection.value.id, image.id)
  }else{
    updateVideoCollectionCover(collection.value.id, image.id)
  }
  
}

onMounted(async() => {
  // TODO: 获取合集信息
  if(collectionDetailStore.img){
    collection.value= await fetchImageCollectionWithCover(id)
  }else{
    collection.value= await fetchCollectionWithCover(id)

  }

  
})


onBeforeMount(() => {
  const idParam = route.params.id;
  const id = Array.isArray(idParam) ? parseInt(idParam[0], 10) : parseInt(idParam as any, 10);
  if(collectionDetailStore.img){
    imageManagerStore.setCollection(isNaN(id) ? null : id)
  }else{
    collectionStore.setCollection(isNaN(id) ? null : id);

  }
})
</script>

<style scoped>
.form-row {
  margin-bottom: 20px;
}
/* 为表单标签添加加粗样式 */
:deep(.n-form-item-label) {
  font-weight: bold;
}
/* 为创建时间标签添加加粗样式 */
.form-row .font-bold {
  font-weight: bold;
}
</style>