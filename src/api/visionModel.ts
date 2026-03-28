import request from '../utils/request'

export interface VisionModelResult {
  code: number
  message: string
  data: string | null
}

export function getVisionModel() {
  return request.get<VisionModelResult>('/vision-model')
}

export function switchVisionModel(model: string) {
  return request.put<VisionModelResult>('/vision-model', null, { params: { model } })
}
