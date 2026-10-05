import request from '../utils/request'

export interface DerivativeJob {
  assetId: number
  mediaType: 'image' | 'video'
  hash: string
  fileName: string
  jobId: number
  status: string
  error?: string | null
  diagnostics?: string | null
  packageId?: string | null
  recipeVersion: string
  createdAt: string
  updatedAt: string
  activePackageId?: string | null
}

export const fetchDerivativeStatus = () => request.get<DerivativeJob[], DerivativeJob[]>('/reprocess/derivatives/status')
export const enqueueDerivatives = (limit = 100) => request.post<{ jobIds: number[] }, { jobIds: number[] }>('/reprocess/derivatives/enqueue', { limit, purpose: 'migration' })
export const retryDerivative = (jobId: number) => request.post(`/reprocess/derivatives/${jobId}/retry`)
export const rollbackDerivative = (assetId: number) => request.post(`/reprocess/derivatives/${assetId}/rollback`)
