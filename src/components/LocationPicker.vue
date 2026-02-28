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
      <n-button-group size="small">
        <n-button
          v-for="layer in layerOptions"
          :key="layer.id"
          :type="activeLayer === layer.id ? 'primary' : 'default'"
          @click="switchLayer(layer.id)"
        >
          {{ layer.name }}
        </n-button>
      </n-button-group>
      <n-button v-if="modelValue" quaternary type="error" size="small" @click="clearLocation">
        清除位置
      </n-button>
    </div>
    <div ref="mapContainer" class="location-picker-map" :style="{ height: mapHeight }"></div>
    <div v-if="modelValue" class="location-picker-hint">
      点击地图选点或拖动标记修改位置；也可在上方输入经纬度后失焦生效
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { NInput, NInputGroup, NInputGroupLabel, NButton, NButtonGroup } from 'naive-ui'
import { wgs84ToGcj02, gcj02ToWgs84, isInChina } from '../utils/coordTransform'

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
    defaultLayer?: string
  }>(),
  {
    modelValue: null,
    height: '320px',
    defaultCenter: () => [39.9042, 116.4074],
    defaultZoom: 10,
    defaultLayer: 'gaode'
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: LocationPoint | null]
}>()

const mapContainer = ref<HTMLDivElement | null>(null)
let map: maplibregl.Map | null = null
let marker: maplibregl.Marker | null = null

const latInput = ref('')
const lngInput = ref('')
const activeLayer = ref(props.defaultLayer)

const layerOptions = [
  { id: 'osm', name: 'OpenStreetMap' },
  { id: 'gaode', name: '高德地图' }
]

const mapHeight = computed(() => props.height)

function isGaodeActive() {
  return activeLayer.value === 'gaode'
}

// 存储策略：国内坐标以 GCJ-02 存储，境外坐标以 WGS-84 存储。
// 读取时根据坐标是否在中国 + 当前底图决定是否需要转换。
function toDisplayCoord(lat: number, lng: number): { lat: number; lng: number } {
  const inChina = isInChina(lng, lat)
  if (inChina && !isGaodeActive()) {
    const [wLng, wLat] = gcj02ToWgs84(lng, lat)
    return { lat: wLat, lng: wLng }
  }
  if (!inChina && isGaodeActive()) {
    const [gLng, gLat] = wgs84ToGcj02(lng, lat)
    return { lat: gLat, lng: gLng }
  }
  return { lat, lng }
}

// 将地图返回的坐标转为存储格式（国内→GCJ-02，境外→WGS-84）
function toStoreCoord(lat: number, lng: number): { lat: number; lng: number } {
  if (isGaodeActive()) {
    return { lat, lng }
  }
  if (isInChina(lng, lat)) {
    const [gLng, gLat] = wgs84ToGcj02(lng, lat)
    return { lat: gLat, lng: gLng }
  }
  return { lat, lng }
}

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

function updateMarker() {
  if (!map) return
  if (props.modelValue) {
    const d = toDisplayCoord(props.modelValue.lat, props.modelValue.lng)
    if (marker) {
      marker.setLngLat([d.lng, d.lat])
    } else {
      marker = new maplibregl.Marker({ draggable: true })
        .setLngLat([d.lng, d.lat])
        .addTo(map)
      marker.on('dragend', () => {
        const lngLat = marker!.getLngLat()
        const stored = toStoreCoord(lngLat.lat, lngLat.lng)
        emitPosition({ lat: stored.lat, lng: stored.lng })
      })
    }
  } else {
    if (marker) {
      marker.remove()
      marker = null
    }
  }
}

function switchLayer(layerId: string) {
  if (!map || activeLayer.value === layerId) return
  activeLayer.value = layerId
  map.setLayoutProperty('osm-layer', 'visibility', layerId === 'osm' ? 'visible' : 'none')
  map.setLayoutProperty('gaode-layer', 'visibility', layerId === 'gaode' ? 'visible' : 'none')

  if (props.modelValue) {
    const d = toDisplayCoord(props.modelValue.lat, props.modelValue.lng)
    map.setCenter([d.lng, d.lat])
    updateMarker()
  }
}

onMounted(() => {
  if (!mapContainer.value) return

  const center: [number, number] = props.modelValue
    ? (() => {
        const d = toDisplayCoord(props.modelValue.lat, props.modelValue.lng)
        return [d.lng, d.lat] as [number, number]
      })()
    : [props.defaultCenter[1], props.defaultCenter[0]]

  map = new maplibregl.Map({
    container: mapContainer.value,
    style: {
      version: 8 as const,
      sources: {
        'osm-tiles': {
          type: 'raster' as const,
          tiles: [
            'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
            'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
            'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'
          ],
          tileSize: 256,
          attribution: '© OpenStreetMap contributors',
          maxzoom: 19
        },
        'gaode-tiles': {
          type: 'raster' as const,
          tiles: [
            'http://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
            'http://webrd02.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
            'http://webrd03.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
            'http://webrd04.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}'
          ],
          tileSize: 256,
          attribution: '© 高德地图',
          maxzoom: 18
        }
      },
      layers: [
        {
          id: 'osm-layer',
          type: 'raster' as const,
          source: 'osm-tiles',
          layout: { visibility: (activeLayer.value === 'osm' ? 'visible' : 'none') as 'visible' | 'none' }
        },
        {
          id: 'gaode-layer',
          type: 'raster' as const,
          source: 'gaode-tiles',
          layout: { visibility: (activeLayer.value === 'gaode' ? 'visible' : 'none') as 'visible' | 'none' }
        }
      ]
    },
    center,
    zoom: props.defaultZoom
  })

  map.addControl(new maplibregl.NavigationControl(), 'top-left')

  map.on('click', (e: maplibregl.MapMouseEvent) => {
    const { lat, lng } = e.lngLat
    const stored = toStoreCoord(lat, lng)
    emitPosition({ lat: stored.lat, lng: stored.lng })
  })

  map.on('load', () => {
    updateMarker()
  })
})

watch(() => props.modelValue, (newVal, oldVal) => {
  updateMarker()
  if (newVal && !oldVal && map) {
    const d = toDisplayCoord(newVal.lat, newVal.lng)
    map.jumpTo({ center: [d.lng, d.lat] })
  }
}, { deep: true })

onBeforeUnmount(() => {
  if (marker) {
    marker.remove()
    marker = null
  }
  if (map) {
    map.remove()
    map = null
  }
})

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
