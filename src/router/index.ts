import { createRouter, createWebHistory } from 'vue-router'
const Upload = () => import('../views/Upload.vue')
const VideoMetaManager = () => import('../views/VideoMetaManager.vue')
const Map = () => import('../views/Map.vue')
const DefaultPage = () => import('../views/defaultPage.vue')
const CollectionManager = () => import('../views/CollectionManager.vue')
const CollectionDetail = () => import('../views/CollectionDetail.vue')
const ImageManager = () => import('../views/image/ImageListPage.vue')
const TagManager = () => import('../views/TagManager.vue')
const SystemConfigManager = () => import('../views/SystemConfigManager.vue')
const CommentManager = () => import('../views/CommentManager.vue')
const ShareManager = () => import('../views/ShareManager.vue')
const LoginPage = () => import('../views/LoginPage.vue')
const UserProfile = () => import('../views/UserProfile.vue')
const TaskProgress = () => import('../views/TaskProgress.vue')
const VisionModelManager = () => import('../views/VisionModelManager.vue')
const EmbeddingManager = () => import('../views/EmbeddingManager.vue')
const ReprocessManager = () => import('../views/ReprocessManager.vue')

const routes = [
    {
        path: '/login',
        name: 'login',
        component: LoginPage,
        meta: { public: true, title: '管理员登录' }
    },
    {
        path: '/',
        name: 'home',
        meta: { title: '工作台' },
        component: DefaultPage
    },
    {
    path: '/upload',
    name: 'upload',
    meta: { title: '上传素材' },
    component: Upload
    },
    {
        path: '/manager/video',
        name:'videoManager',
        meta: { title: '视频管理' },
        component: VideoMetaManager

    },
    {
        path:'/manager/image',
        name:'imageManager',
        meta: { title: '图片管理' },
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
        path: '/manager/comment',
        name: 'commentManager',
        meta: { title: '评论管理' },
        component: CommentManager
    },
    {
        path: '/manager/share',
        name: 'shareManager',
        meta: { title: '分享管理' },
        component: ShareManager
    },
    {
        path: '/manager/system-config',
        name: 'systemConfigManager',
        meta: { title: '系统配置管理' },
        component: SystemConfigManager
    },
    {
        path: '/manager/task-progress',
        name: 'taskProgress',
        meta: { title: '处理进度' },
        component: TaskProgress
    },
    {
        path: '/manager/vision-model',
        name: 'visionModelManager',
        meta: { title: '视觉模型管理' },
        component: VisionModelManager
    },
    {
        path: '/manager/embedding',
        name: 'embeddingManager',
        meta: { title: '向量嵌入' },
        component: EmbeddingManager
    },
    {
        path: '/manager/reprocess',
        name: 'reprocess',
        meta: { title: '重新处理' },
        component: ReprocessManager
    },
    {
        path: '/map',
        name:'map',
        meta: { title: '媒体地图' },
        component: Map
    },
    {
        path: '/profile',
        name: 'profile',
        meta: { title: '个人设置' },
        component: UserProfile
    },
    { path: '/:pathMatch(.*)*', name: 'notFound', component: () => import('../views/NotFound.vue'), meta: { title: '页面未找到' } }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, _from, next) => {
  const token = localStorage.getItem('token')
  if (to.meta.public) {
    if (token && to.name === 'login') {
      next('/')
    } else {
      next()
    }
  } else if (!token) {
    next({ path: '/login', query: { redirect: to.fullPath } })
  } else {
    next()
  }
})

router.afterEach(to => { document.title = `${to.meta.title || '工作台'} · Albireo` })

export default router
