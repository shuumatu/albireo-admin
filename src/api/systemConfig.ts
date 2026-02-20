import request from '../utils/request'

export interface SystemConfigVO {
  id: number
  category: string
  key: string
  value: string
  valueType: string
  isEncrypted: boolean
  description: string | null
  metadata: string | null
  createdAt: string
  updatedAt: string
}

export interface SystemConfigCreateDTO {
  category: string
  key: string
  value: string
  valueType?: string
  isEncrypted?: boolean
  description?: string
  metadata?: string
}

export interface SystemConfigUpdateDTO {
  value?: string
  description?: string
  metadata?: string
}

export interface PageResultVO<T> {
  data: T[]
  total: number
}

export function fetchAllConfigs(): Promise<SystemConfigVO[]> {
  return request.get('/system-config')
}

export function fetchAllConfigsWithPagination(
  page: number = 1,
  pageSize: number = 20
): Promise<PageResultVO<SystemConfigVO>> {
  return request.get('/system-config/page', {
    params: { page, pageSize }
  })
}

export function fetchConfigsByCategory(category: string): Promise<SystemConfigVO[]> {
  return request.get(`/system-config/${encodeURIComponent(category)}`)
}

export function fetchConfigsByCategoryWithPagination(
  category: string,
  page: number = 1,
  pageSize: number = 20
): Promise<PageResultVO<SystemConfigVO>> {
  return request.get(`/system-config/${encodeURIComponent(category)}/page`, {
    params: { page, pageSize }
  })
}

export function getConfig(category: string, key: string): Promise<SystemConfigVO> {
  return request.get(`/system-config/${encodeURIComponent(category)}/${encodeURIComponent(key)}`)
}

export function upsertConfig(payload: SystemConfigCreateDTO): Promise<void> {
  return request.post('/system-config', payload)
}

export function updateConfig(
  category: string,
  key: string,
  payload: SystemConfigUpdateDTO
): Promise<void> {
  return request.put(
    `/system-config/${encodeURIComponent(category)}/${encodeURIComponent(key)}`,
    payload
  )
}

export function deleteConfig(category: string, key: string): Promise<void> {
  return request.delete(
    `/system-config/${encodeURIComponent(category)}/${encodeURIComponent(key)}`
  )
}

