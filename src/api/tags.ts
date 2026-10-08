import request from "../utils/request";
import { assertTagDeleted, normalizeTagList, normalizeUpdatedTag, resolveCreatedTag, type TagItem } from '../utils/tagResponse';

export type { TagItem } from '../utils/tagResponse';

interface TagParams {
  name: string;
}

// page/pageSize remain accepted for existing callers; this endpoint returns the full list.
export async function fetchTags(params?: { keyword?: string; page?: number; pageSize?: number }): Promise<TagItem[]> {
  const response = await request.get<unknown, unknown>('/tag/list', { params: { keyword: params?.keyword } });
  return normalizeTagList(response);
}

export async function createTag(params: TagParams): Promise<TagItem> {
  const response = await request.post<unknown, unknown>('/tag/create', null, {
    params: { tagName: params.name }  // 作为 URL 查询参数
  });
  // Names may contain SQL LIKE escape characters; match exactly in the full list.
  return resolveCreatedTag(response, params.name, () => fetchTags());
}

export async function updateTag(id: number, params: TagParams): Promise<TagItem> {
  const response = await request.post<unknown, unknown>(`/tag/update/${id}`, null, {
    params: { name: params.name }
  });
  return normalizeUpdatedTag(response, id, params.name);
}

export async function deleteTag(id: number): Promise<void> {
  const response = await request.post<unknown, unknown>(`/tag/delete/${id}`);
  assertTagDeleted(response);
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
export async function fetchTagsWithVideoId(videoId: number): Promise<TagItem[]> {
  const response = await request.get<unknown, unknown>('/tag/get-tags-with-video-id', { params: { videoId } });
  return normalizeTagList(response);
}

export async function fetchTagsWithImageId(imageId: number): Promise<TagItem[]> {
  const response = await request.get<unknown, unknown>('/tag/get-tags-with-image-id', { params: { imageId } });
  return normalizeTagList(response);
}
