import request from '../utils/request'

export interface SystemConfigVO {
  id: number
  category: string
  key: string
  value: string | null
  valueType: string
  isEncrypted: boolean
  description: string | null
  metadata: string | null
  createdAt: string
  updatedAt: string
  configured?: boolean
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

/** 管理端安全清单：加密字段只返回 configured 状态，不返回明文。 */
export function fetchManagedConfigs(): Promise<SystemConfigVO[]> {
  return request.get('/system-config/managed')
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
