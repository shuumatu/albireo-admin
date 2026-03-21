import request from "../utils/request";

interface CollectionParams {
    id: number;
    name: string;
    description: string;
}

// 视频合集
export function saveVideoCollection(params: CollectionParams){
    return request.put('/collection/video/info', params)
}

export function updateVideoCollectionCover(collectionId: number, imageId: number){
    return request.put('/collection/video/cover', { collectionId, imageId })
}

// 图片合集
export function saveImageCollection(params: CollectionParams){
    return request.put('/collection/image/info', params)
}

export function updateImageCollectionCover(collectionId: number, imageId: number){
    return request.put('/collection/image/cover', { collectionId, imageId })
}

// 通用：视频合集与图片合集均使用此接口删除
export function deleteCollection(collectionId: number){
    return request.delete(`/collection/${collectionId}`)
}







