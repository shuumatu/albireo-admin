import request from "../utils/request";

interface CollectionParams {
    id: number;
    name: string;
    description: string;
}




export function saveImageCollection(params: CollectionParams){
    return request.post('/collection/update-image-collection-info', params)
}

export function saveVideoCollection(params: CollectionParams){
    return request.post('/collection/update-video-collection-info', params)
}

export function updateImageCollectionCover(collectionId: number, imageId: number){
    return request.post('/collection/update-image-collection-cover', { collectionId, imageId })
}

export function updateVideoCollectionCover(collectionId: number, imageId: number){
    return request.post('/collection/update-video-collection-cover', { collectionId, imageId })
}







