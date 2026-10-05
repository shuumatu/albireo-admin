<template>
  <section class="map-page admin-page">
    <header class="admin-page-header"><div><h1>媒体地图</h1><p>按拍摄位置浏览素材，点击聚合标记放大查看。</p></div><n-button :loading="loading" :disabled="!ready" @click="loadMedia">刷新当前区域</n-button></header>
    <div class="map-toolbar admin-panel"><n-radio-group :value="activeLayer" @update:value="switchLayer" :disabled="!ready"><n-radio-button value="osm">普通地图</n-radio-button><n-radio-button value="satellite">卫星图像</n-radio-button></n-radio-group><span aria-live="polite">当前区域 · {{ totalImages }} 张图片 · {{ totalVideos }} 个视频</span></div>
    <n-alert v-if="mapError || dataError" type="warning" class="map-alert">{{ mapError || dataError }}<template #action><n-button size="small" @click="mapError ? initializeMap() : loadMedia()">重试</n-button></template></n-alert>
    <div class="map-stage admin-panel">
      <div ref="mapContainer" class="map-container" aria-label="媒体拍摄位置地图" />
      <div v-if="!mapError && (loading || !ready)" class="map-status" role="status"><n-spin size="small" /><span>{{ ready ? '正在加载区域内的素材…' : '正在加载地图…' }}</span></div>
      <div v-else-if="!dataError && !mapError && totalImages + totalVideos === 0" class="map-status">当前区域没有带位置的素材，试试移动或缩小地图。</div>
    </div>
  </section>
</template>
<script setup lang="ts">
import { imageForSize } from '../utils/mediaQuality'

import { onBeforeUnmount, onMounted, ref } from 'vue'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { fetchMapAggregation, type MapPoint } from '../api/map'
import { getPublicSiteOrigin } from './video/composables/videoFormat'

const mapContainer = ref<HTMLElement | null>(null)
const activeLayer = ref('osm'), ready = ref(false), loading = ref(false)
const dataError = ref(''), mapError = ref(''), totalImages = ref(0), totalVideos = ref(0)
let map: maplibregl.Map | null = null
let markers: maplibregl.Marker[] = []
let resizeObserver: ResizeObserver | null = null
let requestSequence = 0, disposed = false
let refreshTimer: ReturnType<typeof setTimeout> | undefined
function clearMarkers() { markers.forEach(marker => marker.remove()); markers = [] }
function createPointPopup(point: MapPoint, index?: number) {
  const content = document.createElement('div')
  content.className = 'media-map-popup'
  if (point.thumbnailUrl) { const image = document.createElement('img'); image.src = imageForSize(point.renditions, point.thumbnailUrl, 240, 160, 'cover', window.devicePixelRatio); image.alt = point.mediaType === 'image' ? '图片缩略图' : '视频封面'; image.addEventListener('error', () => image.remove(), { once: true }); content.append(image) }
  const title = document.createElement('strong')
  title.textContent = `${index == null ? '' : `${index + 1}. `}${point.mediaType === 'image' ? '图片素材' : '视频素材'}`
  const link = document.createElement('a')
  link.textContent = '查看作品 ↗'
  link.href = `${getPublicSiteOrigin()}/${point.mediaType}/${encodeURIComponent(point.uuid)}`
  link.target = '_blank'; link.rel = 'noopener noreferrer'
  content.append(title, link)
  return content
}
function createLocationPopup(points: MapPoint[]) {
  if (points.length === 1) return createPointPopup(points[0]!)
  const content = document.createElement('div')
  content.className = 'media-map-popup media-map-popup-group'
  const heading = document.createElement('strong')
  heading.textContent = `此处有 ${points.length} 个素材`
  content.append(heading)
  points.forEach((point, index) => {
    const item = createPointPopup(point, index)
    item.classList.add('media-map-popup-item')
    content.append(item)
  })
  return content
}
async function loadMedia() {
  if (!map || !ready.value || disposed) return
  const sequence = ++requestSequence
  const bounds = map.getBounds()
  loading.value = true; dataError.value = ''
  try {
    const data = await fetchMapAggregation({ minLng: Math.max(-180, bounds.getWest()), minLat: Math.max(-85, bounds.getSouth()), maxLng: Math.min(180, bounds.getEast()), maxLat: Math.min(85, bounds.getNorth()), zoom: Math.floor(map.getZoom()) })
    if (disposed || sequence !== requestSequence || !map) return
    if (!Array.isArray(data.clusters) || !Array.isArray(data.points)) throw new Error('Invalid response')
    clearMarkers(); totalImages.value = data.totalImages; totalVideos.value = data.totalVideos
    for (const cluster of data.clusters) {
      const element = document.createElement('button')
      element.className = 'media-map-cluster'; element.textContent = String(cluster.count)
      element.setAttribute('aria-label', `放大查看 ${cluster.imageCount} 张图片与 ${cluster.videoCount} 个视频`)
      element.addEventListener('click', () => map?.easeTo({ center: [cluster.longitude, cluster.latitude], zoom: Math.min(18, map.getZoom() + 2), duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 400 }))
      markers.push(new maplibregl.Marker({ element }).setLngLat([cluster.longitude, cluster.latitude]).addTo(map))
    }
    const locations = new Map<string, MapPoint[]>()
    for (const point of data.points) {
      const key = `${point.longitude},${point.latitude}`
      const points = locations.get(key)
      if (points) points.push(point)
      else locations.set(key, [point])
    }
    for (const points of locations.values()) {
      const point = points[0]!
      const element = document.createElement('button')
      element.className = points.length > 1 ? 'media-map-cluster' : 'media-map-point'
      element.textContent = points.length > 1 ? String(points.length) : point.mediaType === 'image' ? '图' : '影'
      element.setAttribute('aria-label', points.length > 1 ? `查看此处 ${points.length} 个素材` : point.mediaType === 'image' ? '查看此处图片' : '查看此处视频')
      markers.push(new maplibregl.Marker({ element }).setLngLat([point.longitude, point.latitude]).setPopup(new maplibregl.Popup({ offset: 20 }).setDOMContent(createLocationPopup(points))).addTo(map))
    }
  } catch { if (!disposed && sequence === requestSequence) { clearMarkers(); totalImages.value = 0; totalVideos.value = 0; dataError.value = '区域内素材加载失败，请检查连接后重试。' } }
  finally { if (sequence === requestSequence) loading.value = false }
}
function scheduleRefresh() { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => void loadMedia(), 250) }
function switchLayer(layer: string) {
  if (!map || !ready.value || !['osm', 'satellite'].includes(layer)) return
  activeLayer.value = layer
  map.setLayoutProperty('osm-layer', 'visibility', layer === 'osm' ? 'visible' : 'none')
  map.setLayoutProperty('satellite-layer', 'visibility', layer === 'satellite' ? 'visible' : 'none')
}
function initializeMap() {
  if (!mapContainer.value || disposed) return
  requestSequence++; clearTimeout(refreshTimer); clearMarkers(); map?.remove(); map = null
  ready.value = false; loading.value = false; mapError.value = ''; dataError.value = ''; totalImages.value = 0; totalVideos.value = 0
  try {
    map = new maplibregl.Map({
      container: mapContainer.value, center: [113.2644, 23.1291], zoom: 5, minZoom: 1, renderWorldCopies: false,
      locale: { 'NavigationControl.ZoomIn': '放大地图', 'NavigationControl.ZoomOut': '缩小地图', 'NavigationControl.ResetBearing': '重置朝向', 'AttributionControl.ToggleAttribution': '显示地图来源', 'Popup.Close': '关闭素材信息' },
      style: { version: 8, sources: {
        osm: { type: 'raster', tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' },
        satellite: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, attribution: 'Tiles © Esri & the GIS community' },
      }, layers: [
        { id: 'osm-layer', type: 'raster', source: 'osm', layout: { visibility: activeLayer.value === 'osm' ? 'visible' : 'none' } },
        { id: 'satellite-layer', type: 'raster', source: 'satellite', layout: { visibility: activeLayer.value === 'satellite' ? 'visible' : 'none' } },
      ] },
    })
    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.on('load', () => { ready.value = true; void loadMedia() })
    map.on('movestart', () => { requestSequence++ })
    map.on('moveend', scheduleRefresh)
    map.on('error', () => { if (!disposed) mapError.value = '底图加载遇到问题，请检查网络或重试。' })
  } catch { mapError.value = '地图初始化失败，请检查浏览器是否支持 WebGL 后重试。' }
}
onMounted(() => { initializeMap(); resizeObserver = new ResizeObserver(() => map?.resize()); if (mapContainer.value) resizeObserver.observe(mapContainer.value) })
onBeforeUnmount(() => { disposed = true; requestSequence++; clearTimeout(refreshTimer); resizeObserver?.disconnect(); clearMarkers(); map?.remove(); map = null })
</script>
<style scoped>
.map-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 14px; padding: 14px 18px; margin-bottom: 16px; }.map-toolbar > span { color: var(--admin-muted); font-size: 12px; margin-left: auto; }.map-alert { margin-bottom: 16px; }.map-stage { height: clamp(400px, 65vh, 900px); position: relative; overflow: hidden; }.map-container { width: 100%; height: 100%; }.map-status { position: absolute; bottom: 34px; left: 16px; right: 16px; width: fit-content; max-width: calc(100% - 32px); display: flex; gap: 9px; align-items: center; padding: 10px 14px; background: #ffffffee; box-shadow: var(--admin-shadow); border-radius: 9px; font-size: 12px; color: var(--admin-muted); }
.map-container :deep(.media-map-cluster), .map-container :deep(.media-map-point) { border: 3px solid white; border-radius: 50%; background: var(--admin-accent, #2f7b5b); color: white; width: 42px; height: 42px; font-weight: 600; box-shadow: 0 3px 12px #294a3030; }.map-container :deep(.media-map-point) { width: 32px; height: 32px; font-size: 11px; }.map-container :deep(.media-map-popup) { display: grid; gap: 9px; width: 180px; }.map-container :deep(.media-map-popup img) { width: 180px; max-height: 140px; object-fit: cover; border-radius: 6px; }.map-container :deep(.media-map-popup a) { color: var(--admin-accent, #2f7b5b); }
@media(max-width:640px) { .map-toolbar > span { margin-left: 0; }.map-stage { height: 62vh; min-height: 380px; } }
.map-container :deep(.media-map-popup-group) { width: 204px; max-height: min(340px, 45vh); overflow-y: auto; padding-right: 8px; box-sizing: border-box; gap: 14px; }
.map-container :deep(.media-map-popup-item) { border-top: 1px solid var(--admin-border); padding-top: 12px; }
</style>
