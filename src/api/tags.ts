import request from "../utils/request";

interface TagParams {
  name: string;
}

interface TagItem {
  id: number;
  name: string;
  usageCount?: number;
}

export function fetchTags(params?: { keyword?: string }): Promise<TagItem[]> {
  return request.get('/tag/list', { params });
}

export function createTag(params: TagParams): Promise<TagItem> {
  return request.post('/tag/create', null, {
    params: { tagName: params.name }  // 作为 URL 查询参数
  });
}

export function updateTag(id: number, params: TagParams): Promise<TagItem> {
  return request.post(`/tag/update/${id}`, null, {
    params: { name: params.name }
    });
}

export function deleteTag(id: number): Promise<void> {
  return request.post(`/tag/delete/${id}`);
}

// 批量操作接口
interface TagRelationParams {
  tagIds: number[];
  videoId?: number;
  imageId?: number;
}

export function addTagsToVideo(params: TagRelationParams): Promise<void> {
  return request.post('/tag/add-tags-to-video', params);
}

export function addTagsToImages(params: TagRelationParams): Promise<void> {
  return request.post('/tag/add-tags-to-images', params);
}

export function removeTagsFromVideo(params: TagRelationParams): Promise<void> {
  return request.post('/tag/remove-tags-from-video', params);
}

export function removeTagsFromImages(params: TagRelationParams): Promise<void> {
  return request.post('/tag/remove-tags-from-images', params);
}

// 获取视频/图片的标签列表
export function fetchTagsWithVideoId(videoId: number): Promise<TagItem[]> {
  return request.get('/tag/get-tags-with-video-id', { params: { videoId } });
}

export function fetchTagsWithImageId(imageId: number): Promise<TagItem[]> {
  return request.get('/tag/get-tags-with-image-id', { params: { imageId } });
}