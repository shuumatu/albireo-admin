import { GridOutline, CloudUploadOutline, ImagesOutline, VideocamOutline, AlbumsOutline, PricetagsOutline, ChatbubbleEllipsesOutline, ShareSocialOutline, PulseOutline, SparklesOutline, CubeOutline, RefreshOutline, SettingsOutline, PersonOutline, MapOutline } from '@vicons/ionicons5'

export const navigationGroups = [
  { label: '工作空间', items: [
    { label: '工作台', path: '/', icon: GridOutline, description: '概览与常用入口' },
    { label: '上传素材', path: '/upload', icon: CloudUploadOutline, description: '上传图片与视频，管理上传队列' },
  ] },
  { label: '内容管理', items: [
    { label: '图片管理', path: '/manager/image', icon: ImagesOutline, description: '浏览、筛选与编辑图片' },
    { label: '视频管理', path: '/manager/video', icon: VideocamOutline, description: '管理视频与处理状态' },
    { label: '合集管理', path: '/manager/collection', icon: AlbumsOutline, description: '整理图片与视频合集' },
    { label: '标签管理', path: '/manager/tag', icon: PricetagsOutline, description: '维护内容标签' },
    { label: '评论管理', path: '/manager/comment', icon: ChatbubbleEllipsesOutline, description: '查看与管理评论' },
    { label: '分享管理', path: '/manager/share', icon: ShareSocialOutline, description: '创建分享与管理访问权限' },
  ] },
  { label: '处理与设置', items: [
    { label: '处理进度', path: '/manager/task-progress', icon: PulseOutline, description: '查看后台任务进度与失败原因' },
    { label: '视觉模型', path: '/manager/vision-model', icon: SparklesOutline, description: '选择用于内容分析的模型' },
    { label: '向量嵌入', path: '/manager/embedding', icon: CubeOutline, description: '管理语义检索与向量任务' },
    { label: '重新处理', path: '/manager/reprocess', icon: RefreshOutline, description: '重新生成媒体内容与分析结果' },
    { label: '系统配置', path: '/manager/system-config', icon: SettingsOutline, description: '管理服务配置与参数' },
  ] },
]
export const searchablePages = [
  ...navigationGroups.flatMap(group => group.items),
  { label: '个人设置', path: '/profile', icon: PersonOutline, description: '账户信息与密码' },
  { label: '媒体地图', path: '/map', icon: MapOutline, description: '查看媒体拍摄位置' },
]
