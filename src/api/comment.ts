import request from '../utils/request'

export type CommentTargetType = 'video' | 'image'

export interface CommentVO {
  id: number
  userId: number
  username: string
  content: string
  parentId: number | null
  createdAt: string | null
  replies?: CommentVO[] | null
}

export function getComments(targetType: CommentTargetType, targetId: string): Promise<CommentVO[]> {
  return request.get(`/comment/${targetType}/${targetId}`)
}

export function getCommentCount(targetType: CommentTargetType, targetId: string): Promise<number> {
  return request.get(`/comment/${targetType}/${targetId}/count`)
}

export function deleteComment(id: number): Promise<void> {
  return request.delete(`/comment/${id}`)
}
