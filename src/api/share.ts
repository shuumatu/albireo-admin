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

/**
 * 分享更新参数。普通字段传 string/number 表示更新；不传（undefined）表示保持现状；
 * `clearXxx=true` 哨兵用来把对应列改回 NULL（解决"清空过期 / 次数 / 密码"）。
 * 当 clear 与对应字段同时存在时，clear 优先。
 */
export interface ShareUpdateDTO {
  title?: string
  description?: string
  password?: string
  expiresAt?: string
  maxViews?: number
  clearPassword?: boolean
  clearExpiresAt?: boolean
  clearMaxViews?: boolean
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

export function getMyShares(page = 1, pageSize = 20, filters: {keyword?: string; targetType?: ShareTargetType; status?: ShareStatus} = {}): Promise<PageResult<ShareVO>> {
  return request.get('/share/my', { params: { page, pageSize, ...filters } })
}

export function updateShare(id: number, payload: ShareUpdateDTO): Promise<ShareVO> {
  return request.put(`/share/${id}`, payload)
}

/**
 * 启用 / 停用分享。expired 由系统判定，不能从 UI 设置。
 */
export function updateShareStatus(id: number, status: 'active' | 'disabled'): Promise<ShareVO> {
  return request.patch(`/share/${id}/status`, { status })
}

export function deleteShare(id: number): Promise<void> {
  return request.delete(`/share/${id}`)
}

export function getShareStats(id: number): Promise<ShareStatsVO> {
  return request.get(`/share/${id}/stats`)
}

/**
 * 二维码图片 URL（公开端点，可直接当 &lt;img src&gt; 用）。
 * 加 cache-buster 防止编辑分享后旧 QR 被浏览器缓存复用。
 */
export function getShareQRCodeUrl(shareCode: string, size = 300): string {
  return `/api/metadata/share/access/${shareCode}/qrcode?size=${size}&t=${Date.now()}`
}
