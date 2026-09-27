import request from '../utils/request'

export interface LocationVO {
  longitude: number
  latitude: number
  altitude?: number | null
}

export interface LocationUpdateDTO {
  longitude: number
  latitude: number
  altitude?: number
}

export async function fetchVideoLocation(uuid: string): Promise<LocationVO | null> {
  try {
    const data = await request.get<LocationVO, LocationVO>(`/video/${uuid}/location`)
    return data
  } catch (err: any) {
    if (err?.response?.status === 404) {
      return null
    }
    throw err
  }
}

export function updateVideoLocation(uuid: string, payload: LocationUpdateDTO) {
  return request.put(`/video/${uuid}/location`, payload)
}

export async function fetchImageLocation(uuid: string): Promise<LocationVO | null> {
  try {
    const data = await request.get<LocationVO, LocationVO>(`/image/${uuid}/location`)
    return data
  } catch (err: any) {
    if (err?.response?.status === 404) {
      return null
    }
    throw err
  }
}

export function updateImageLocation(uuid: string, payload: LocationUpdateDTO) {
  return request.put(`/image/${uuid}/location`, payload)
}


