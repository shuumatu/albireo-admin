<template>
  <div style="height: 100vh; width: 100vw; position: relative;">
    <div ref="mapContainer" style="height: 100%; width: 100%;"></div>

    <div class="layer-switcher">
      <n-button-group size="small">
        <n-button
          :type="activeLayer === 'osm' ? 'primary' : 'default'"
          @click="switchLayer('osm')"
        >
          普通地图
        </n-button>
        <n-button
          :type="activeLayer === 'satellite' ? 'primary' : 'default'"
          @click="switchLayer('satellite')"
        >
          卫星图像
        </n-button>
      </n-button-group>
    </div>

    <!-- 播放器模态框 -->
    <n-modal v-model:show="showPlayer" preset="card" style="width: 700px;">
      <template #header>{{ selectedVideo?.title }}</template>
      <video controls autoplay style="width: 100%;">
        <source :src="selectedVideo?.videoUrl" type="video/mp4" />
        浏览器不支持视频播放
      </video>
    </n-modal>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const mapContainer = ref(null)
let map = null
const markers = []

const activeLayer = ref('osm')

const videos = ref([
  {
    id: '1',
    title: '富士山日出',
    location: { lat: 35.3606, lng: 138.7274 },
    thumbnail: '/thumbnails/fuji.jpg',
    videoUrl: 'https://your-cdn.com/videos/fuji.mp4'
  },
  {
    id: '2',
    title: '大阪夜景',
    location: { lat: 34.6937, lng: 135.5023 },
    thumbnail: '/thumbnails/osaka.jpg',
    videoUrl: 'https://your-cdn.com/videos/osaka.mp4'
  }
])

const selectedVideo = ref(null)
const showPlayer = ref(false)

function openVideo(video) {
  selectedVideo.value = video
  showPlayer.value = true
}

function createTriangleElement() {
  const el = document.createElement('div')
  el.className = 'custom-triangle-icon'
  return el
}

function createPopupContent(video) {
  const container = document.createElement('div')
  container.style.width = '12rem'

  const img = document.createElement('img')
  img.src = video.thumbnail
  img.style.width = '100%'
  img.style.borderRadius = '4px'
  container.appendChild(img)

  const title = document.createElement('div')
  title.textContent = video.title
  title.style.fontSize = '0.875rem'
  title.style.marginTop = '0.5rem'
  title.style.fontWeight = '600'
  container.appendChild(title)

  const btn = document.createElement('button')
  btn.textContent = '播放'
  btn.style.cssText = 'margin-top:0.5rem;padding:4px 15px;font-size:12px;cursor:pointer;border-radius:3px;border:1px solid #ddd;background:#fff;'
  btn.addEventListener('click', () => openVideo(video))
  container.appendChild(btn)

  return container
}

function switchLayer(layerId) {
  if (!map || activeLayer.value === layerId) return
  activeLayer.value = layerId
  map.setLayoutProperty('osm-layer', 'visibility', layerId === 'osm' ? 'visible' : 'none')
  map.setLayoutProperty('satellite-layer', 'visibility', layerId === 'satellite' ? 'visible' : 'none')
}

onMounted(() => {
  if (!mapContainer.value) return

  map = new maplibregl.Map({
    container: mapContainer.value,
    style: {
      version: 8,
      sources: {
        'osm-tiles': {
          type: 'raster',
          tiles: [
            'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
            'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
            'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'
          ],
          tileSize: 256,
          attribution: '© OpenStreetMap contributors'
        },
        'satellite-tiles': {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
          ],
          tileSize: 256,
          attribution: 'Tiles © Esri & the GIS community'
        }
      },
      layers: [
        {
          id: 'osm-layer',
          type: 'raster',
          source: 'osm-tiles',
          layout: { visibility: 'visible' }
        },
        {
          id: 'satellite-layer',
          type: 'raster',
          source: 'satellite-tiles',
          layout: { visibility: 'none' }
        }
      ]
    },
    center: [139.7, 35.6],
    zoom: 5
  })

  map.addControl(new maplibregl.NavigationControl())

  map.on('load', () => {
    videos.value.forEach(video => {
      const el = createTriangleElement()

      const popup = new maplibregl.Popup({ offset: 10 })
        .setDOMContent(createPopupContent(video))

      const m = new maplibregl.Marker({ element: el })
        .setLngLat([video.location.lng, video.location.lat])
        .setPopup(popup)
        .addTo(map)

      markers.push(m)
    })
  })
})

onBeforeUnmount(() => {
  markers.forEach(m => m.remove())
  markers.length = 0
  if (map) {
    map.remove()
    map = null
  }
})
</script>

<style>
.custom-triangle-icon {
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 12px solid rgba(255, 255, 255, 0.5);
  cursor: pointer;
}

.layer-switcher {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 1;
}
</style>
