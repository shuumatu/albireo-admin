import request from "../utils/request";
import { normalizeCollectionPage } from '../utils/collectionPage'

// 分页查询参数接口

export type VideoListOrderBy = 'createdAt' | 'updatedAt' | 'duration'
export type VideoListOrder = 'asc' | 'desc'

export interface VideoListParams {
  page?: number;
  pageSize?: number;
  collectionId: number|null|string;
  /** 标题 / 描述 / 文件名模糊匹配 */
  keyword?: string;
  /** 后端按 status 精确匹配 */
  status?: string;
  /** 后端按 visibility 精确匹配 */
  visibility?: string;
  /**
   * 位置过滤：'yes' = 仅有位置；'no' = 仅无位置；undefined = 不过滤。
   * 与 ImageParams.hasLocation 同形态。
   */
  hasLocation?: 'yes' | 'no';
  /** 排序字段，默认 createdAt */
  orderBy?: VideoListOrderBy;
  /** 排序方向，默认 desc */
  order?: VideoListOrder;
}

interface CollectionsManagerParams {
  page?: number;     // 页码
  pageSize?: number; // 每页数量
  keyword?: string;  // 搜索关键词
}

// 添加合集视频查询参数接口
interface CollectionVideosParams {
  page?: number;
  pageSize?: number;
}



interface CollectionsParams 
{ videoIds: (number)[], collectionIds: (number)[] }
interface CollectionParams 
{ videoIds: (number), collectionIds: (number)[] }

interface CollectionItem {
  id: string
  name: string
}



/**
 * 后端 VideoVO 在前端的镜像。后端 ffprobe 异步回写的字段（duration/宽高/文件大小）
 * 老数据可能为 null，前端按字段缺失绕过显示，绝不阻塞列表 UI。
 */
export interface VideoItem {
  id: number
  uuid: string
  title: string | null
  description: string | null
  location: string | null
  shotAt: string | null
  fileName: string
  objectKey: string
  sourceUrl?: string | null
  videoVersions?: { resolution: string; status: string; url?: string | null }[]
  presignUrl: string
  videoUrl: string
  coverUrl: string | null
  status?: 'uploading' | 'pending' | 'processing' | 'transcoding' | 'ai_analyzing' | 'done' | 'failed' | 'process_failed' | 'transcode_failed' | 'ai_analyze_failed' | null
  visibility: string | null
  createdAt: string
  updatedAt: string
  collections: { id: number; name: string; description: string }[] | null
  /** 视频时长（毫秒）。null 表示后端尚未抽到，前端不显示时长徽标。 */
  durationMs?: number | null
  width?: number | null
  height?: number | null
  /** 文件字节数。null = 未抽到。 */
  fileSize?: number | null
  /** 是否拥有 PostGIS geom。后端按 (geom IS NOT NULL) 计算。 */
  hasLocation?: boolean | null
}

export interface VideoListResponse {
  total: number;
  data: VideoItem[];
}

interface CollectionResponse {
  id: number;
  title: string;
  fileName: string;
}

interface CollectionWithCoverResponse {
  id: number;
  name: string;
  description: string;
  createdAt: string;
  imageUrl: string;
  displayUrl?: string;
  mediumUrl?: string;
  thumbnailUrl?: string;
}


export function fetchVideoList(params: VideoListParams ) {
  return request.get<VideoListResponse>('/video/get-videos', { params })
}

/**
 * 后端 /collection/video/list 走的是统一 Result<T> 包装：{ code, message, data }。
 * 这里把 data 拆出来，让调用方拿到的就是 CollectionItem[]，
 * 否则 ImageListPage / VideoListPage 里的 (list as any[]).map(...) 会因为
 * 拿到的是 {code,message,data} 对象而抛错，最终表现为「加入合集」下拉无数据。
 */
export async function fetchCollectionsIds(): Promise<CollectionItem[]> {
  const res = await request.get<any>('/collection/video/list')
  if (Array.isArray(res)) return res as CollectionItem[]
  if (res && Array.isArray((res as any).data)) return (res as any).data as CollectionItem[]
  return []
}

export async function fetchImageCollectionsIds(): Promise<CollectionItem[]> {
  const res = await request.get<any>('/collection/image/list')
  if (Array.isArray(res)) return res as CollectionItem[]
  if (res && Array.isArray((res as any).data)) return (res as any).data as CollectionItem[]
  return []
}

export function addVideosToCollections(params: CollectionsParams ) {
  return request.post('/collection/video/batch-add', params)
}

//暂时没被使用
export function UpdateVideoCollections(params: CollectionParams ) {
  return request.put('/collection/video/video-collections', params)
}


interface CollectionsManagerResponse {
    id: number;
    name: string;
    description: string;
    coverUrl: string;
    videoCount: number;
    total: number;
}


export async function fetchCollections(params:CollectionsManagerParams={}){
  const response = await request.get<unknown, unknown>('/collection/video/manager-list', { params })
  return normalizeCollectionPage<CollectionsManagerResponse>(response)
}

export async function fetchImageCollections(params:CollectionsManagerParams={}){
  const response = await request.get<unknown, unknown>('/collection/image/manager-list', { params })
  return normalizeCollectionPage<CollectionsManagerResponse>(response)
}

// 添加获取合集视频的接口函数
export function fetchVideosByCollection(params: CollectionVideosParams) {
  return request.get<CollectionResponse[]>('/video/get-videos-by-collection', { params })
}

export function fetchCollectionWithCover(collectionId: number){
  return request.get<CollectionWithCoverResponse>(`/collection/video/${collectionId}`)
}

export function fetchImageCollectionWithCover(collectionId: number){
  return request.get<CollectionWithCoverResponse>(`/collection/image/${collectionId}`)
}

export function deleteVideos(videoIds: number[]){
  return request.post('/video/delete-videos',  videoIds )
}

interface VideoParams {
  title?: string;
  description?: string;
  shotAt?: string | null;
  visibility?: string | null;
}


export function updateVideo(videoId: number, params: VideoParams)
{ return request.post(`/video/update-video/${videoId}`, params) }

export function removeVideosFromCollections(params: CollectionsParams)
{ return request.delete('/collection/video/batch-remove', { data: params })}

export function removeImagesFromCollections(params: { collectionIds: number[], imageIds: number[] })
{ return request.delete('/collection/image/batch-remove', { data: params })}

interface addCollection{
  name: string;
  description: string;
}

export function addVideoCollection(params: addCollection){
  return request.post('/collection/video', params)
}

export function addImageCollection(params: addCollection){
  return request.post('/collection/image', params)
}
