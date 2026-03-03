import request from '../utils/request'

export interface ExifData {
  cameraMake?: string
  cameraModel?: string
  lens?: string
  aperture?: string
  shutterSpeed?: string
  iso?: number
  focalLength?: string
  exposureCompensation?: string
  whiteBalance?: string
  meteringMode?: string
  flash?: string
  dateTimeOriginal?: string
  [key: string]: any
}

export async function fetchImageExif(uuid: string): Promise<ExifData | null> {
  try {
    const data = await request.get<ExifData>(`/image/${uuid}/exif`)
    return data as ExifData
  } catch (err: any) {
    if (err?.response?.status === 404) {
      return null
    }
    throw err
  }
}

export function updateImageExif(uuid: string, payload: ExifData) {
  return request.put(`/image/${uuid}/exif`, payload)
}
