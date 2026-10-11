import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parse, compileScript } from '@vue/compiler-sfc'
import ts from 'typescript'

// Execute the actual component's setup and event handlers with a map boundary
// double. This catches coordinate changes on both reads and writes without tiles.
const source = await readFile(new URL('../src/components/LocationPicker.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source)
const script = compileScript(descriptor, { id: 'location-picker-test' }).content
const code = ts.transpileModule(script.replace(/import\.meta\.env/g, '({})'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText

async function mountPicker(point) {
  const mounted = []
  const emitted = []
  let map
  let marker
  class MapDouble {
    handlers = {}
    constructor(options) { this.options = options; map = this }
    addControl() {}
    on(event, handler) { this.handlers[event] = handler }
    setStyle() {}
    jumpTo(options) { this.center = options.center }
    remove() {}
  }
  class MarkerDouble {
    handlers = {}
    constructor() { marker = this }
    setLngLat(value) { this.coordinate = value; return this }
    addTo() { return this }
    on(event, handler) { this.handlers[event] = handler }
    getLngLat() { return { lng: this.coordinate[0], lat: this.coordinate[1] } }
    remove() {}
  }
  const imports = {
    vue: {
      defineComponent: options => options,
      ref: value => ({ value }),
      computed: getter => ({ get value() { return getter() } }),
      watch: (getter, handler, options) => { if (options?.immediate) handler(getter()) },
      onMounted: callback => mounted.push(callback),
      onBeforeUnmount: () => {}
    },
    'maplibre-gl': { default: { Map: MapDouble, Marker: MarkerDouble, NavigationControl: class {}, FullscreenControl: class {} } },
    'maplibre-gl/dist/maplibre-gl.css': {},
    'naive-ui': {}
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', 'fetch', 'document', code)(
    name => {
      assert.ok(name in imports, `Unexpected component dependency: ${name}`)
      return imports[name]
    },
    module, module.exports,
    async () => ({ text: async () => JSON.stringify({ version: 8, sources: {}, layers: [] }) }),
    { addEventListener() {}, removeEventListener() {} }
  )
  const state = module.exports.default.setup({
    modelValue: point, defaultCenter: [23.1291, 113.2644], defaultZoom: 10, defaultLayer: 'protomaps-light'
  }, { expose() {}, emit: (...args) => emitted.push(args) })
  state.mapContainer.value = {}
  for (const callback of mounted) await callback()
  map.handlers.load()
  return { map, marker, state, emitted }
}

for (const [name, lat, lng] of [
  ['Guangzhou', 23.1291, 113.2644],
  ['Seoul', 37.5665, 126.978],
  ['Hanoi', 21.0278, 105.8342],
  ['Tokyo', 35.6895, 139.6917],
  ['Paris', 48.8566, 2.3522]
]) {
  test(`${name}: loading, selecting and dragging a location preserve WGS84`, async () => {
    const { map, marker, state, emitted } = await mountPicker({ lat, lng })
    assert.deepEqual(map.options.center, [lng, lat])
    assert.deepEqual(marker.coordinate, [lng, lat])
    map.handlers.click({ lngLat: { lng, lat } })
    assert.deepEqual(emitted.pop(), ['update:modelValue', { lat, lng }])
    marker.coordinate = [lng + 0.001, lat + 0.001]
    marker.handlers.dragend()
    assert.deepEqual(emitted.pop(), ['update:modelValue', { lat: lat + 0.001, lng: lng + 0.001 }])
    await state.switchLayer('satellite')
    assert.deepEqual(map.center, [lng, lat])
    assert.deepEqual(marker.coordinate, [lng, lat])
    state.latInput.value = String(lat)
    state.lngInput.value = String(lng)
    state.applyCoordInput()
    assert.deepEqual(emitted.pop(), ['update:modelValue', { lat, lng }])
  })
}
