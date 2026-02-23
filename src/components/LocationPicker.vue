<template>
  <div class="location-picker">
    <div class="location-picker-toolbar">
      <n-input-group class="coord-inputs">
        <n-input-group-label style="width: 48px;">纬度</n-input-group-label>
        <n-input
          v-model:value="latInput"
          placeholder="例如 39.9042"
          type="number"
          style="width: 140px;"
          @blur="applyCoordInput"
        />
        <n-input-group-label style="width: 48px;">经度</n-input-group-label>
        <n-input
          v-model:value="lngInput"
          placeholder="例如 116.4074"
          type="number"
          style="width: 140px;"
          @blur="applyCoordInput"
        />
      </n-input-group>
      <n-button v-if="modelValue" quaternary type="error" size="small" @click="clearLocation">
        清除位置
      </n-button>
    </div>
    <div class="location-picker-map" :style="{ height: mapHeight }">
      <l-map
        ref="mapRef"
        :zoom="mapZoom"
        :center="mapCenter"
        :options="{ scrollWheelZoom: true }"
        style="height: 100%; width: 100%;"
        @ready="onMapReady"
      >
        <l-control-layers position="topright" />
        <!-- OpenStreetMap 作为默认底图 -->
        <l-tile-layer
          layer-type="base"
          name="OpenStreetMap"
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          :max-zoom="19"
          attribution="© OpenStreetMap contributors"
        />
        <!-- 高德地图 -->
        <l-tile-layer
          layer-type="base"
          name="高德地图"
          url="http://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}"
          :subdomains="'1234'"
          :max-zoom="18"
          attribution="© 高德地图"
        />
        <l-marker
          :key="markerKey"
          v-if="displayPosition"
          :lat-lng="[displayPosition.lat, displayPosition.lng]"
          :draggable="true"
          @dragend="onMarkerDragEnd"
        />
      </l-map>
    </div>
    <div v-if="modelValue" class="location-picker-hint">
      点击地图选点或拖动标记修改位置；也可在上方输入经纬度后失焦生效
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import {
  LMap,
  LTileLayer,
  LMarker,
  LControlLayers
} from '@vue-leaflet/vue-leaflet'
import 'leaflet/dist/leaflet.css'
import type { Map } from 'leaflet'
import L from 'leaflet'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import { NInput, NInputGroup, NInputGroupLabel, NButton } from 'naive-ui'
import { wgs84ToGcj02, gcj02ToWgs84, isInChina } from '../utils/coordTransform'

delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow
})

export interface LocationPoint {
  lat: number
  lng: number
}

const props = withDefaults(
  defineProps<{
    modelValue?: LocationPoint | null
    height?: string
    defaultCenter?: [number, number]
    defaultZoom?: number
    /** 初始默认底图名称，需与模板中 name 一致 */
    defaultLayer?: string
  }>(),
  {
    modelValue: null,
    height: '320px',
    defaultCenter: () => [39.9042, 116.4074],
    defaultZoom: 10,
    defaultLayer: '高德地图' // 与实际默认激活图层保持一致
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: LocationPoint | null]
}>()

const mapRef = ref<InstanceType<typeof LMap> & { leafletObject: Map } | null>(null)
const latInput = ref('')
const lngInput = ref('')
const activeLayer = ref<string>(props.defaultLayer) // 用 prop 初始化，不再硬编码

const mapHeight = computed(() => props.height)
const mapZoom = ref(props.defaultZoom)

// 存储策略：国内坐标以 GCJ-02 存储，境外坐标以 WGS-84 存储。
// 读取时根据坐标是否在中国 + 当前底图决定是否需要转换。
function toDisplayCoord(lat: number, lng: number): { lat: number; lng: number } {
  const inChina = isInChina(lng, lat)
  if (inChina && activeLayer.value !== '高德地图') {
    // 存储的是 GCJ-02，OSM 需要 WGS-84
    const [wLng, wLat] = gcj02ToWgs84(lng, lat)
    return { lat: wLat, lng: wLng }
  }
  if (!inChina && activeLayer.value === '高德地图') {
    // 存储的是 WGS-84，高德需要 GCJ-02
    const [gLng, gLat] = wgs84ToGcj02(lng, lat)
    return { lat: gLat, lng: gLng }
  }
  return { lat, lng }
}

// 将地图返回的坐标转为存储格式（国内→GCJ-02，境外→WGS-84）
function toStoreCoord(lat: number, lng: number): { lat: number; lng: number } {
  if (activeLayer.value === '高德地图') {
    // 高德返回 GCJ-02；境外 GCJ-02 == WGS-84（identity），直接存储均正确
    return { lat, lng }
  }
  // OSM 返回 WGS-84；国内需转为 GCJ-02 存储
  if (isInChina(lng, lat)) {
    const [gLng, gLat] = wgs84ToGcj02(lng, lat)
    return { lat: gLat, lng: gLng }
  }
  return { lat, lng }
}

// marker 显示坐标（已转为当前底图坐标系）
const displayPosition = computed(() => {
  if (!props.modelValue) return null
  return toDisplayCoord(props.modelValue.lat, props.modelValue.lng)
})

// 部分情况下切换底图后 marker 不会立刻吃到新 latLng（表现为“第一次切换不对，第二次才对”）
// 通过 key 强制重建 marker，消除内部状态残留与时序问题
const markerKey = computed(() => {
  if (!props.modelValue) return `none:${activeLayer.value}`
  return `${activeLayer.value}:${props.modelValue.lat},${props.modelValue.lng}`
})

// 地图中心也需要使用显示坐标系，否则切换底图后视角偏移
const mapCenter = computed<[number, number]>(() => {
  if (props.modelValue) {
    const d = toDisplayCoord(props.modelValue.lat, props.modelValue.lng)
    return [d.lat, d.lng]
  }
  return props.defaultCenter
})

function syncInputsFromModel() {
  if (props.modelValue) {
    latInput.value = String(props.modelValue.lat)
    lngInput.value = String(props.modelValue.lng)
  } else {
    latInput.value = ''
    lngInput.value = ''
  }
}

watch(() => props.modelValue, syncInputsFromModel, { immediate: true })

function emitPosition(point: LocationPoint | null) {
  emit('update:modelValue', point)
}

function onMapReady() {
  const map = mapRef.value?.leafletObject
  if (!map) return

  function syncActiveLayer() {
    const baseContainer = document.querySelector('.leaflet-control-layers-base')
    if (!baseContainer) return
    const checked = baseContainer.querySelector<HTMLInputElement>('input[type="radio"]:checked')
    if (!checked) return
    const span = checked.parentElement?.querySelector('span')
    const name = span?.textContent?.trim()
    if (name) activeLayer.value = name
  }

  setTimeout(syncActiveLayer, 0)

  setTimeout(() => {
    const baseContainer = document.querySelector('.leaflet-control-layers-base')
    if (!baseContainer) return

    baseContainer.querySelectorAll<HTMLInputElement>('input[type="radio"]').forEach(radio => {
      radio.addEventListener('change', () => {
        const span = radio.parentElement?.querySelector('span')
        const newLayer = span?.textContent?.trim() || ''
        activeLayer.value = newLayer

        if (props.modelValue) {
          const d = toDisplayCoord(props.modelValue.lat, props.modelValue.lng)
          setTimeout(() => {
            map.setView([d.lat, d.lng], map.getZoom(), { animate: false })
          }, 50)
        }
      })
    })
  }, 100)

  map.on('click', (e: { latlng: { lat: number; lng: number } }) => {
    const { lat, lng } = e.latlng
    const stored = toStoreCoord(lat, lng)
    emitPosition({ lat: stored.lat, lng: stored.lng })
  })
}

onBeforeUnmount(() => {
  const map = mapRef.value?.leafletObject
  if (map) {
    map.off('click')
    map.off('baselayerchange')
  }
})

// 关键：使用 dragend，而不是 update:lat-lng，避免与受控 :lat-lng 形成循环
function onMarkerDragEnd(e: any) {
  const latlng = e.target.getLatLng()
  const stored = toStoreCoord(latlng.lat, latlng.lng)
  emitPosition({ lat: stored.lat, lng: stored.lng })
}

function applyCoordInput() {
  const lat = parseFloat(latInput.value)
  const lng = parseFloat(lngInput.value)
  if (!Number.isNaN(lat) && !Number.isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
    emitPosition({ lat, lng })
  } else if (latInput.value === '' && lngInput.value === '') {
    emitPosition(null)
  }
}

function clearLocation() {
  latInput.value = ''
  lngInput.value = ''
  emitPosition(null)
}
</script>

<style scoped>
.location-picker {
  width: 100%;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--n-border-color);
}

.location-picker-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: var(--n-color);
  border-bottom: 1px solid var(--n-border-color);
  flex-wrap: wrap;
}

.coord-inputs {
  display: flex;
  align-items: center;
}

.location-picker-map {
  width: 100%;
  min-height: 200px;
}

.location-picker-hint {
  padding: 6px 12px;
  font-size: 12px;
  color: var(--n-text-color-3);
  background: var(--n-color);
  border-top: 1px solid var(--n-border-color);
}
</style>
