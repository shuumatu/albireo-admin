import type { MediaRendition } from '../types/media'
import request from '../utils/request'

export interface MapPoint {
  renditions?: MediaRendition[]
  uuid: string
  mediaType: 'video' | 'image'
  objectKey: string
  thumbnailUrl: string | null
  longitude: number
  latitude: number
}
export interface MapCluster {
  clusterId: string
  longitude: number
  latitude: number
  count: number
  videoCount: number
  imageCount: number
}
export interface MapAggregation {
  clusters: MapCluster[]
  points: MapPoint[]
  totalVideos: number
  totalImages: number
}
export function fetchMapAggregation(params: { minLng: number; minLat: number; maxLng: number; maxLat: number; zoom: number }) {
  return request.get<MapAggregation, MapAggregation>('/map/aggregation', { params })
}
