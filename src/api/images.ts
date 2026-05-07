import request from "../utils/request";

export type ImageListOrderBy = 'createdAt' | 'updatedAt' | 'shotAt'
export type ImageListOrder = 'asc' | 'desc'

export interface ImageParams {
  page: number;
  pageSize: number;
  uuid?: string;
  /** 业务类型：photo / cover / other */
  type?: string;
  /** 标题 / 文件名 / 描述模糊匹配 */
  keyword?: string;
  /** 后端按 status 精确匹配（uploading / pending / processing / done / failed） */
  status?: string;
  /**
   * 位置过滤：'yes' = 仅有位置；'no' = 仅无位置；undefined = 不过滤。
   * 用字符串而非 boolean，避免被序列化成 'true'/'false'，与后端 String 白名单一致。
   */
  hasLocation?: 'yes' | 'no';
  /** 排序字段，默认 createdAt */
  orderBy?: ImageListOrderBy;
  /** 排序方向，默认 desc */
  order?: ImageListOrder;
}

/**
 * 后端 ImageVO 在前端的镜像。新数据完整，老数据可能在 createdAt/updatedAt 缺失，
 * UI 使用前都做容错。
 */
export interface ImageItem {
  id: number;
  uuid: string;
  fileName: string;
  imageUrl: string;
  title: string | null;
  description: string | null;
  type: string;
  status: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  shotAt?: string | null;
  collections?: { id: number; name: string; description?: string }[] | null;
  /** 是否拥有 PostGIS geom；后端按 (geom IS NOT NULL) 计算返回。老接口可能为 null。 */
  hasLocation?: boolean | null;
}
export interface ImageResponse {
  data: ImageItem[];
  total: number;
}

export function fetchImages(params: ImageParams) {
  return request.get<ImageResponse>("/image/get-all-images",{params});
}


export function fetchImagesWithCollectionId(collectionId: number|null, params: ImageParams) {
  return request.get<ImageResponse>(`/image/get-images-with-collection-id/${collectionId}`,{params});
}


export function deleteImage(ids: number[]) {
  return request.post(`/image/delete-images`,ids);
}

export interface updateImageParams {
  title?: string | null;
  description?: string | null;
  type?: string | null;
  /** ISO 字符串（含时区）；后端按 Timestamp 解析 */
  shotAt?: string | null;
}

export function updateImage(id:number, params: updateImageParams) {
  return request.post(`/image/update-image/${id}`,params);
}


interface CollectionsParams 
{ imageIds: (number)[], collectionIds: (number)[] }

export function addImagesToCollections(params: CollectionsParams) {
  return request.post(`/collection/image/batch-add`, params);
}

export function removeImagesFromCollections(params: CollectionsParams) {
  return request.delete(`/collection/image/batch-remove`, { data: params });
}

export interface CollectionResponse
{ id: number, name:string }

export function fetchCollectionsWithImageId(imageId: number):Promise<{data: CollectionResponse[]}>{
  return request.get(`/collection/image/by-image`, { params: {imageId} });
}

export function deleteImages(imageIds: number[]) {
  return request.post(`/image/delete-images`,imageIds);
}
