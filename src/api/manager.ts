import request from "../utils/request";

// 分页查询参数接口

interface VideoListParams {
  page?: number;
  pageSize?: number;
  collectionId: number|null|string;
  // title?: string;
  // description?: string;
  // fileName?: string;
  // status?: string;
  // visibility?: string;
  // [key: string]: any;
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



// 后端返回数据接口
export interface VideoListResponse {
  total: number;
  data: any[];
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
}


export function fetchVideoList(params: VideoListParams ) {
  return request.get<VideoListResponse>('/video/get-videos-v2', { params })
}

export function fetchCollectionsIds(): Promise<CollectionItem[]> {
  return request.get('/collection/get-collections')
}

export function fetchImageCollectionsIds(): Promise<CollectionItem[]> {
  return request.get('/collection/get-image-collections')
}

export function addVideosToCollections(params: CollectionsParams ) {
  return request.post('/collection/add-to-collections', params)
}

//暂时没被使用
export function UpdateVideoCollections(params: CollectionParams ) {
  return request.post('/collection/update-collections', params)
}


interface CollectionsManagerResponse {
    id: number;
    name: string;
    description: string;
    coverUrl: string;
    videoCount: number;
    total: number;
}


export function fetchCollections(params:CollectionsManagerParams={}){
  return request.get<CollectionsManagerResponse[]>('/collection/manager-get', { params })
}

export function fetchImageCollections(params:CollectionsManagerParams={}){
  return request.get<CollectionsManagerResponse[]>('/collection/image-manager-get', { params })
}

// 添加获取合集视频的接口函数
export function fetchVideosByCollection(params: CollectionVideosParams) {
  return request.get<CollectionResponse[]>('/video/get-videos-by-collection', { params })
}

export function fetchCollectionWithCover(collectionId: number){
  return request.get<CollectionWithCoverResponse>('/collection/get-collection-with-cover', { params: { collectionId } })
}

export function fetchImageCollectionWithCover(collectionId: number){
  return request.get<CollectionWithCoverResponse>('/collection/get-image-collection-with-cover', { params: { collectionId } })
}

export function deleteVideos(videoIds: number[]){
  return request.post('/video/delete-videos',  videoIds )
}

interface VideoParams {
  title: string;
  description: string;
}


export function updateVideo(videoId: number, params: VideoParams)
{ return request.post(`/video/update-video/${videoId}`, params) }

export function removeVideosFromCollections(params: CollectionsParams)
{ return request.post('/collection/remove-from-collections', params)}

interface addCollection{
  name: string;
  description: string;
}

export function addVideoCollection(params: addCollection){
  return request.post('/collection/add-video-collection', params)
}

export function addImageCollection(params: addCollection){
  return request.post('/collection/add-image-collection', params)
}