import { createRouter, createWebHistory } from 'vue-router'
import Upload from '../views/Upload.vue'
import VideoMetaManager from '../views/VideoMetaManager.vue'
import Map from '../views/Map.vue'
import DefaultPage from '../views/defaultPage.vue'
import CollectionManager from '../views/CollectionManager.vue'
import CollectionDetail from '../views/CollectionDetail.vue'
import ImageManager from '../views/ImageManager.vue'
import TagManager from '../views/TagManager.vue'

const routes = [
    {
        path: '/',
        name: 'home',
        component: DefaultPage
    },
    {
    path: '/upload',
    name: 'upload',
    component: Upload
    },
    {
        path: '/manager/video',
        name:'videoManager',
        component: VideoMetaManager

    },
    {
        path:'/manager/image',
        name:'imageManager',
        component: ImageManager
    },
    {
        path:'/manager/collection',
        name:'collection',
        meta: { title: '合集管理' },
        component: CollectionManager
    },
    {
        path:'/manager/collection/:id',
        name:'collectionDetail',
        meta: { title: '合集信息' ,parent: 'collection'},
        component:CollectionDetail
    },
    {
        path: '/manager/tag',
        name: 'tagManager',
        meta: { title: '标签管理' },
        component:TagManager
    },
    {
        path: '/map',
        name:'map',
        component: Map
    }


]

const router = createRouter({
  history: createWebHistory(), // 使用 HTML5 模式
  routes
})

export default router