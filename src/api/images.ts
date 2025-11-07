import request from "../utils/request";
export interface ImageParams {
  page: number;
  pageSize: number;
}

export interface ImageItem {
  id: number;
  fileName: string;
  imageUrl: string;
  title: string;
  description: string;
  type: string;
  status: string;
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
  title: string;
  description: string;
  type: string;
}

export function updateImage(id:number, params: updateImageParams) {
  return request.post(`/image/update-image/${id}`,params);
}


interface CollectionsParams 
{ imageIds: (number)[], collectionIds: (number)[] }

export function addImagesToCollections(params: CollectionsParams) {
  return request.post(`/collection/image/add-to-collections`,params);
}

export function removeImagesFromCollections(params: CollectionsParams) {
  return request.post(`/collection/image/remove-from-collections`,params);
}

export interface CollectionResponse
{ id: number, name:string }

export function fetchCollectionsWithImageId(imageId: number):Promise<CollectionResponse[]>{
  return request.get(`/collection/get-collections-with-image-id`, { params: {imageId} });
}

export function deleteImages(imageIds: number[]) {
  return request.post(`/image/delete-images`,imageIds);
}

