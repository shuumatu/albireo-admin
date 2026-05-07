<template>
  <div ref="pickerRoot" class="location-picker" :class="{ 'is-fullscreen': isFullscreen }">
    <div class="location-picker-toolbar">
      <n-input-group class="coord-inputs">
        <n-input-group-label style="width: 48px;">纬度</n-input-group-label>
        <n-input
          v-model:value="latInput"
          placeholder="例如 23.1291"
          type="number"
          style="width: 140px;"
          @blur="applyCoordInput"
        />
        <n-input-group-label style="width: 48px;">经度</n-input-group-label>
        <n-input
          v-model:value="lngInput"
          placeholder="例如 113.2644"
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
    <!--
      全屏时不写 inline height，让 .is-fullscreen 的 CSS（flex: 1）撑满；
      非全屏时由 props.height 决定显示高度。
      避免用 !important 覆盖 inline style 的耦合。
    -->
    <div
      ref="mapContainer"
      class="location-picker-map"
      :style="isFullscreen ? undefined : { height: mapHeight }"
    ></div>
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

/**
 * 4 种底图：
 *  - protomaps-light / protomaps-dark：与公共站「地图检索」页同款 Immich-style 矢量底图
 *    （瓦片来源 protomaps.com，需要 VITE_PROTOMAPS_KEY，样式 JSON 放在 public/map-styles/）。
 *  - normal：UI 上称作「普通」，底层瓦片用高德 raster——国内场景下视觉/标注更直观，
 *            坐标系是 GCJ-02，会激活 toDisplay/toStoreCoord 的偏移转换。
 *            这里没有再单独提供原 OpenStreetMap raster 选项，避免与浅色 vector 重复，
 *            也避免国内打开 OSM 因瓦片源慢而体验差。
 *  - satellite：Esri 世界影像，给视频/图片选位置时确认建筑/地形（WGS-84）。
 *
 * 坐标系策略：
 *   * DB 存的坐标按"国内 GCJ-02 / 境外 WGS-84"区分（与 Map.vue 一致）。
 *   * 高德底图（normal）直接用 GCJ-02；protomaps / satellite 用 WGS-84。
 *   * 切底图时如果是国内点，需要 toDisplayCoord 反算一次，避免点被搬走。
 */
type LayerId = 'protomaps-light' | 'protomaps-dark' | 'normal' | 'satellite'

interface VectorLayerDef {
  id: 'protomaps-light' | 'protomaps-dark'
  name: string
  type: 'vector'
  styleUrl: string
}

interface RasterLayerDef {
  id: 'normal' | 'satellite'
  name: string
  type: 'raster'
  /** 是否使用 GCJ-02 坐标系（仅"普通"——背后是高德） */
  isGcj02: boolean
}

type LayerDef = VectorLayerDef | RasterLayerDef

const LAYER_DEFS: LayerDef[] = [
  { id: 'protomaps-light', name: '浅色', type: 'vector', styleUrl: '/map-styles/light.json' },
  { id: 'protomaps-dark', name: '深色', type: 'vector', styleUrl: '/map-styles/dark.json' },
  // 「普通」按钮在 UI 上保持原有位置/名字，但瓦片源从 OSM 切换到高德——
  // 这是一次"显示名不变、底层数据源变"的替换，附带变更：开启 GCJ-02 坐标系。
  { id: 'normal', name: '普通', type: 'raster', isGcj02: true },
  { id: 'satellite', name: '卫星', type: 'raster', isGcj02: false },
]

const PROTOMAPS_KEY = import.meta.env.VITE_PROTOMAPS_KEY ?? ''

const props = withDefaults(
  defineProps<{
    modelValue?: LocationPoint | null
    height?: string
    defaultCenter?: [number, number]
    defaultZoom?: number
    /**
     * 默认底图。改为 'protomaps-light' —— 与公共站「地图检索」首屏一致的 Immich 浅色矢量风格，
     * 视觉信息密度低、抽屉里看不刺眼。国内拍摄需要中文标注/对齐时可手动切到「普通」（高德）。
     */
    defaultLayer?: LayerId
  }>(),
  {
    modelValue: null,
    // 广州（WGS-84，[lat, lng]）。modelValue 为空时作为初始中心，业务里大多数图/视频
    // 也是华南拍摄；与 Map.vue 的默认中心保持一致，跨页面观感不会跳动。
    height: '360px',
    defaultCenter: () => [23.1291, 113.2644],
    defaultZoom: 10,
    defaultLayer: 'protomaps-light'
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: LocationPoint | null]
}>()

const mapContainer = ref<HTMLDivElement | null>(null)
const pickerRoot = ref<HTMLDivElement | null>(null)
let map: maplibregl.Map | null = null
let marker: maplibregl.Marker | null = null

const latInput = ref('')
const lngInput = ref('')
const activeLayer = ref<LayerId>(props.defaultLayer)
/**
 * 全屏状态。FullscreenControl 触发 fullscreenchange 时维护，用来：
 *  - 切换 .is-fullscreen class，让 map 容器从固定 height 变成 flex 撑满；
 *  - 在退出全屏后调一次 map.resize() 复位画布尺寸。
 */
const isFullscreen = ref(false)

const layerOptions = computed(() => LAYER_DEFS.map(l => ({ id: l.id, name: l.name })))

const mapHeight = computed(() => props.height)

function getLayerDef(id: LayerId): LayerDef {
  return LAYER_DEFS.find(l => l.id === id) ?? LAYER_DEFS[0]
}

function isGcj02Active(): boolean {
  const def = getLayerDef(activeLayer.value)
  return def.type === 'raster' && def.isGcj02
}

// 存储策略：国内坐标以 GCJ-02 存储，境外坐标以 WGS-84 存储。
// 读取时根据坐标是否在中国 + 当前底图决定是否需要转换。
function toDisplayCoord(lat: number, lng: number): { lat: number; lng: number } {
  const inChina = isInChina(lng, lat)
  const gaodeActive = isGcj02Active()
  if (inChina && !gaodeActive) {
    const [wLng, wLat] = gcj02ToWgs84(lng, lat)
    return { lat: wLat, lng: wLng }
  }
  if (!inChina && gaodeActive) {
    const [gLng, gLat] = wgs84ToGcj02(lng, lat)
    return { lat: gLat, lng: gLng }
  }
  return { lat, lng }
}

// 将地图返回的坐标转为存储格式（国内→GCJ-02，境外→WGS-84）
function toStoreCoord(lat: number, lng: number): { lat: number; lng: number } {
  if (isGcj02Active()) {
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

// --- 底图样式加载 ---

async function loadVectorStyle(url: string): Promise<maplibregl.StyleSpecification> {
  // 与公共站 Map.vue 同一约定：JSON 模板里用 __PROTOMAPS_KEY__ 占位，运行时替换。
  // 没有 key 时也会传空字符串过去——protomaps 会 403，但不影响其它图层正常使用。
  const res = await fetch(url)
  const text = await res.text()
  const filled = text.replace(/__PROTOMAPS_KEY__/g, PROTOMAPS_KEY)
  return JSON.parse(filled) as maplibregl.StyleSpecification
}

/**
 * 构造 raster 双件套（普通=高德 / 卫星=Esri）合成样式，根据 activeId 切换可见性。
 * 单一样式承载多套 source/layer 的好处：用 setLayoutProperty 切换 visibility 即可，
 * 不需要每次 setStyle 重建——保留 marker、避免闪烁。
 *
 * 「normal」按钮 UI 上叫「普通」，但瓦片源已替换为高德 webrd。原 OSM raster 在国内
 * 加载又慢、风格又和 protomaps 浅色重复，索性合并掉。
 */
function buildRasterStyle(activeId: 'normal' | 'satellite'): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      'normal-tiles': {
        type: 'raster',
        tiles: [
          'http://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
          'http://webrd02.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
          'http://webrd03.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
          'http://webrd04.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}'
        ],
        tileSize: 256,
        attribution: '© 高德地图',
        maxzoom: 18
      },
      'satellite-tiles': {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
        ],
        tileSize: 256,
        attribution: 'Tiles &copy; Esri &amp; the GIS community',
        maxzoom: 19
      }
    },
    layers: [
      {
        id: 'normal-layer',
        type: 'raster',
        source: 'normal-tiles',
        layout: { visibility: activeId === 'normal' ? 'visible' : 'none' }
      },
      {
        id: 'satellite-layer',
        type: 'raster',
        source: 'satellite-tiles',
        layout: { visibility: activeId === 'satellite' ? 'visible' : 'none' }
      }
    ]
  }
}

/**
 * 切底图。三种过渡：
 *   raster ↔ raster：直接走 setLayoutProperty（保留 source，无重新拉瓦片）
 *   * → vector：fetch JSON 后 setStyle，旧 raster sources 会被替换
 *   vector → raster：rebuild 出整套 raster style 后 setStyle
 *
 * setStyle 会保留 maplibre Marker（marker 是挂在 .maplibregl-canvas-container 子节点的 DOM，
 * 不属于 style 的一部分），但坐标系切换需要在切换完成后调用 updateMarker
 * 重新走一遍 toDisplayCoord，避免国内点在 GCJ-02 ↔ WGS-84 之间错位。
 */
async function switchLayer(layerId: LayerId) {
  if (!map || activeLayer.value === layerId) return

  const oldDef = getLayerDef(activeLayer.value)
  const newDef = getLayerDef(layerId)
  activeLayer.value = layerId

  if (newDef.type === 'raster' && oldDef.type === 'raster') {
    map.setLayoutProperty('normal-layer', 'visibility', layerId === 'normal' ? 'visible' : 'none')
    map.setLayoutProperty('satellite-layer', 'visibility', layerId === 'satellite' ? 'visible' : 'none')
  } else if (newDef.type === 'vector') {
    const style = await loadVectorStyle(newDef.styleUrl)
    map.setStyle(style, { diff: false })
  } else {
    map.setStyle(buildRasterStyle(newDef.id), { diff: false })
  }

  // 坐标系切换（GCJ-02 ↔ WGS-84）下，国内点的视觉位置会偏，需要重新设 marker
  // 并把视图中心也同步过去。境外点不受影响（toDisplayCoord 走 identity 分支）。
  if (props.modelValue) {
    const d = toDisplayCoord(props.modelValue.lat, props.modelValue.lng)
    map.jumpTo({ center: [d.lng, d.lat] })
    updateMarker()
  }
}

onMounted(async () => {
  if (!mapContainer.value) return

  const initialDef = getLayerDef(activeLayer.value)

  const center: [number, number] = props.modelValue
    ? (() => {
        const d = toDisplayCoord(props.modelValue.lat, props.modelValue.lng)
        return [d.lng, d.lat] as [number, number]
      })()
    : [props.defaultCenter[1], props.defaultCenter[0]]

  // 初始 style：vector 走 protomaps JSON，raster 用合成 style
  const initialStyle: maplibregl.StyleSpecification =
    initialDef.type === 'vector'
      ? await loadVectorStyle(initialDef.styleUrl)
      : buildRasterStyle(initialDef.id)

  map = new maplibregl.Map({
    container: mapContainer.value,
    style: initialStyle,
    center,
    zoom: props.defaultZoom
  })

  map.addControl(new maplibregl.NavigationControl(), 'top-left')

  // 全屏按钮：把整个 .location-picker 根容器（含工具栏 + 地图）一起放进全屏，
  // 这样全屏状态下仍然能切底图、改坐标输入、清除位置——而不是只放大裸地图。
  // pickerRoot 一定在 DOM 中（onMounted 之后），用 ! 断言。
  if (pickerRoot.value) {
    map.addControl(new maplibregl.FullscreenControl({ container: pickerRoot.value }), 'top-left')
  }

  map.on('click', (e: maplibregl.MapMouseEvent) => {
    const { lat, lng } = e.lngLat
    const stored = toStoreCoord(lat, lng)
    emitPosition({ lat: stored.lat, lng: stored.lng })
  })

  map.on('load', () => {
    updateMarker()
  })

  document.addEventListener('fullscreenchange', onFullscreenChange)
})

function onFullscreenChange() {
  // FullscreenControl 把 pickerRoot 推到 document.fullscreenElement——以这个为唯一判据，
  // 避免父级抽屉/对话框自身全屏时误触发。
  isFullscreen.value = document.fullscreenElement === pickerRoot.value
  // 全屏切换后地图容器尺寸改变，需要 resize 才能避免画布拉伸；
  // 等 CSS 过渡 + 浏览器全屏布局完成后再调一次。
  window.setTimeout(() => map?.resize(), 80)
}

watch(() => props.modelValue, (newVal, oldVal) => {
  updateMarker()
  if (newVal && !oldVal && map) {
    const d = toDisplayCoord(newVal.lat, newVal.lng)
    map.jumpTo({ center: [d.lng, d.lat] })
  }
}, { deep: true })

onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', onFullscreenChange)
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

/* 全屏：整个 picker 占满浏览器视口，地图容器从固定高度变成 flex 撑满 ——
   inline `style="height: ..."` 在 isFullscreen 时已不再渲染，因此不需要 !important。
   :fullscreen 伪类是 fallback，覆盖少数环境下 isFullscreen 状态更新滞后的渲染帧。 */
.location-picker.is-fullscreen,
.location-picker:fullscreen {
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  border: none;
  border-radius: 0;
  background: var(--n-color);
}

.location-picker.is-fullscreen .location-picker-toolbar,
.location-picker:fullscreen .location-picker-toolbar {
  flex: 0 0 auto;
}

.location-picker.is-fullscreen .location-picker-map,
.location-picker:fullscreen .location-picker-map {
  flex: 1 1 auto;
  min-height: 0;
}

.location-picker.is-fullscreen .location-picker-hint,
.location-picker:fullscreen .location-picker-hint {
  flex: 0 0 auto;
}
</style>
