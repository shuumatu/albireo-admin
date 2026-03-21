import request from '../utils/request'

export type ShareTargetType = 'video' | 'image' | 'collection'
export type ShareStatus = 'active' | 'expired' | 'disabled'

export interface ShareCreateDTO {
  targetType: ShareTargetType
  targetId: number
  title?: string
  description?: string
  password?: string
  expiresAt?: string
  maxViews?: number
}

export interface ShareUpdateDTO {
  title?: string
  description?: string
  password?: string
  expiresAt?: string
  maxViews?: number
  clearPassword?: boolean
}

export interface ShareVO {
  id: number
  shareCode: string
  shareUrl: string
  targetType: ShareTargetType
  targetId: number
  title: string | null
  description: string | null
  hasPassword: boolean
  expiresAt: string | null
  maxViews: number | null
  viewCount: number
  status: ShareStatus
  createdAt: string
  updatedAt: string
}

export interface AccessRecord {
  accessIp: string
  location: string
  userAgent: string
  accessedAt: string
}

export interface GeoCount {
  location: string
  count: number
}

export interface ShareStatsVO {
  totalViews: number
  uniqueIps: number
  recentAccess: AccessRecord[]
  topLocations: GeoCount[]
}

export interface PageResult<T> {
  data: T[]
  total: number
}

export function createShare(payload: ShareCreateDTO): Promise<ShareVO> {
  return request.post('/share', payload)
}

export function getMyShares(page = 1, pageSize = 20): Promise<PageResult<ShareVO>> {
  return request.get('/share/my', { params: { page, pageSize } })
}

export function updateShare(id: number, payload: ShareUpdateDTO): Promise<ShareVO> {
  return request.put(`/share/${id}`, payload)
}

export function deleteShare(id: number): Promise<void> {
  return request.delete(`/share/${id}`)
}

export function getShareStats(id: number): Promise<ShareStatsVO> {
  return request.get(`/share/${id}/stats`)
}

export function getShareQRCodeUrl(shareCode: string, size = 300): string {
  return `/api/metadata/share/access/${shareCode}/qrcode?size=${size}`
}
