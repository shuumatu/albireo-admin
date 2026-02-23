import gcoord from 'gcoord'

/** 判断坐标是否在中国大陆范围内（粗略判断） */
export function isInChina(lng: number, lat: number): boolean {
  return lng > 73 && lng < 135 && lat > 18 && lat < 53
}

/** WGS-84 → GCJ-02（切换到高德地图时，将存储坐标转为显示坐标） */
export function wgs84ToGcj02(lng: number, lat: number): [number, number] {
  if (!isInChina(lng, lat)) return [lng, lat] // 境外不转换
  const result = gcoord.transform([lng, lat], gcoord.WGS84, gcoord.GCJ02) as [number, number]
  return [result[0], result[1]]
}

/** GCJ-02 → WGS-84（高德地图点击/拖动后，将返回坐标转为存储坐标） */
export function gcj02ToWgs84(lng: number, lat: number): [number, number] {
  if (!isInChina(lng, lat)) return [lng, lat] // 境外不转换
  const result = gcoord.transform([lng, lat], gcoord.GCJ02, gcoord.WGS84) as [number, number]
  return [result[0], result[1]]
}

