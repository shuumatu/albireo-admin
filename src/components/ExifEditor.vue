<template>
  <n-spin :show="loading">
    <n-form label-placement="left" label-width="auto" :model="form">
      <n-grid :cols="2" :x-gap="16">
        <n-form-item-gi label="相机制造商">
          <n-auto-complete
            v-model:value="form.cameraMake"
            :options="filteredMakeOptions"
            placeholder="如 Canon"
            :get-show="() => true"
            clearable
          />
        </n-form-item-gi>
        <n-form-item-gi label="相机型号">
          <n-auto-complete
            v-model:value="form.cameraModel"
            :options="filteredModelOptions"
            placeholder="如 EOS R5"
            :get-show="() => true"
            clearable
          />
        </n-form-item-gi>
        <n-form-item-gi label="镜头" :span="2">
          <n-auto-complete
            v-model:value="form.lens"
            :options="filteredLensOptions"
            placeholder="如 Canon RF 50mm F1.2L USM"
            :get-show="() => true"
            clearable
          />
        </n-form-item-gi>
        <n-form-item-gi label="光圈">
          <n-auto-complete
            v-model:value="form.aperture"
            :options="filteredApertureOptions"
            placeholder="如 f/2.8"
            :get-show="() => true"
            clearable
          />
        </n-form-item-gi>
        <n-form-item-gi label="快门速度">
          <n-auto-complete
            v-model:value="form.shutterSpeed"
            :options="filteredShutterSpeedOptions"
            placeholder="如 1/250"
            :get-show="() => true"
            clearable
          />
        </n-form-item-gi>
        <n-form-item-gi label="ISO" :span="2">
          <n-flex align="center" :size="16" style="width: 100%;">
            <n-slider
              v-model:value="isoSliderIndex"
              :min="0"
              :max="ISO_STOPS.length - 1"
              :step="1"
              :marks="isoMarks"
              :format-tooltip="formatIsoTooltip"
              style="flex: 1;"
            />
            <n-input-number
              v-model:value="form.iso"
              :min="25"
              :max="102400"
              :show-button="false"
              placeholder="ISO"
              style="width: 100px;"
            />
          </n-flex>
        </n-form-item-gi>
        <n-form-item-gi label="焦距">
          <n-input-number
            v-model:value="focalLengthNum"
            :min="1"
            :max="2000"
            :show-button="false"
            placeholder="如 50"
            style="width: 100%;"
          >
            <template #suffix>mm</template>
          </n-input-number>
        </n-form-item-gi>
        <n-form-item-gi label="曝光补偿">
          <n-flex align="center" :size="8" style="width: 100%;">
            <n-slider
              v-model:value="evSliderStep"
              :min="-9"
              :max="9"
              :step="1"
              :marks="evMarks"
              :format-tooltip="formatEvTooltip"
              style="flex: 1;"
            />
            <n-text
              strong
              style="min-width: 36px; text-align: center; white-space: nowrap; font-variant-numeric: tabular-nums;"
            >
              {{ evDisplayText }}
            </n-text>
          </n-flex>
        </n-form-item-gi>
        <n-form-item-gi label="白平衡">
          <n-auto-complete
            v-model:value="form.whiteBalance"
            :options="filteredWhiteBalanceOptions"
            placeholder="如 Auto"
            :get-show="() => true"
            clearable
          />
        </n-form-item-gi>
        <n-form-item-gi label="测光模式">
          <n-auto-complete
            v-model:value="form.meteringMode"
            :options="filteredMeteringModeOptions"
            placeholder="如 Evaluative"
            :get-show="() => true"
            clearable
          />
        </n-form-item-gi>
        <n-form-item-gi label="闪光灯">
          <n-switch v-model:value="flashEnabled">
            <template #checked>开启</template>
            <template #unchecked>关闭</template>
          </n-switch>
        </n-form-item-gi>
        <n-form-item-gi label="拍摄时间">
          <n-date-picker
            v-model:value="dateTimeTimestamp"
            type="datetime"
            clearable
            style="width: 100%;"
          />
        </n-form-item-gi>
      </n-grid>

      <n-divider title-placement="left">自定义字段</n-divider>

      <n-dynamic-input v-model:value="customFields" :show-sort-button="false" :on-create="onCreateCustomField">
        <template #default="{ value }">
          <n-flex align="center" style="width: 100%;">
            <n-input v-model:value="value.key" placeholder="字段名" style="width: 40%;" />
            <n-input v-model:value="value.val" placeholder="字段值" style="width: 55%;" />
          </n-flex>
        </template>
        <template #action="{ index, remove }">
          <n-button quaternary circle style="margin-left: 8px;" @click="remove(index)">
            <template #icon><n-icon :component="SubtractIcon" /></template>
          </n-button>
        </template>
        <template #create-button-default>
          添加
        </template>
      </n-dynamic-input>
      <n-button v-if="customFields.length > 0" dashed block style="margin-top: 8px;" @click="addCustomField">
        <template #icon><n-icon :component="AddIcon" /></template>
        添加
      </n-button>
    </n-form>
  </n-spin>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { Subtract24Regular as SubtractIcon, Add24Regular as AddIcon } from '@vicons/fluent'
import type { ExifData } from '../api/exif'
import { useLensfun } from '../composables/useLensfun'

const BUILTIN_KEYS = new Set([
  'cameraMake', 'cameraModel', 'lens', 'aperture', 'shutterSpeed',
  'iso', 'focalLength', 'exposureCompensation', 'whiteBalance',
  'meteringMode', 'flash', 'dateTimeOriginal'
])

const ISO_STOPS = [50, 100, 200, 400, 800, 1600, 3200, 6400, 12800, 25600, 51200]
const isoMarks: Record<number, string> = {
  0: '50', 3: '400', 6: '3200', 10: '51200'
}
const evMarks: Record<number, string> = {
  '-9': '-3', 0: '0', 9: '+3'
}

const APERTURE_PRESETS = [
  'f/1.0', 'f/1.2', 'f/1.4', 'f/1.8', 'f/2', 'f/2.8', 'f/3.5', 'f/4',
  'f/4.5', 'f/5', 'f/5.6', 'f/6.3', 'f/7.1', 'f/8', 'f/9', 'f/10',
  'f/11', 'f/13', 'f/14', 'f/16', 'f/18', 'f/20', 'f/22', 'f/32'
]
const SHUTTER_SPEED_PRESETS = [
  '30"', '15"', '8"', '4"', '2"', '1"',
  '1/2', '1/4', '1/8', '1/15', '1/30', '1/60', '1/125', '1/250',
  '1/500', '1/1000', '1/2000', '1/4000', '1/8000'
]
const WHITE_BALANCE_PRESETS = [
  'Auto', 'Daylight', 'Cloudy', 'Shade', 'Tungsten', 'Fluorescent', 'Flash', 'Custom'
]
const METERING_MODE_PRESETS = [
  'Evaluative', 'Center-weighted', 'Spot', 'Partial', 'Multi-zone', 'Average'
]

function toOptions(values: string[]) {
  return values.map(v => ({ label: v, value: v }))
}

const apertureOptions = toOptions(APERTURE_PRESETS)
const shutterSpeedOptions = toOptions(SHUTTER_SPEED_PRESETS)
const whiteBalanceOptions = toOptions(WHITE_BALANCE_PRESETS)
const meteringModeOptions = toOptions(METERING_MODE_PRESETS)

const props = defineProps<{
  modelValue: ExifData
  loading?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: ExifData]
}>()

const form = ref<ExifData>({ ...props.modelValue })
const customFields = ref<{ key: string; val: string }[]>([])
let suppressSync = false

const cameraMakeRef = computed(() => form.value.cameraMake)
const cameraModelRef = computed(() => form.value.cameraModel)
const { cameraMakeOptions, cameraModelOptions, lensOptions } = useLensfun(cameraMakeRef, cameraModelRef)

function fuzzyFilter(options: { label: string; value: string }[], input: string | undefined) {
  if (!input?.trim()) return options
  const lower = input.toLowerCase()
  return options.filter(o => o.label.toLowerCase().includes(lower))
}

const filteredMakeOptions = computed(() => fuzzyFilter(cameraMakeOptions.value, form.value.cameraMake))
const filteredModelOptions = computed(() => fuzzyFilter(cameraModelOptions.value, form.value.cameraModel))
const filteredLensOptions = computed(() => fuzzyFilter(lensOptions.value, form.value.lens))
const filteredApertureOptions = computed(() => fuzzyFilter(apertureOptions, form.value.aperture))
const filteredShutterSpeedOptions = computed(() => fuzzyFilter(shutterSpeedOptions, form.value.shutterSpeed))
const filteredWhiteBalanceOptions = computed(() => fuzzyFilter(whiteBalanceOptions, form.value.whiteBalance))
const filteredMeteringModeOptions = computed(() => fuzzyFilter(meteringModeOptions, form.value.meteringMode))

const isoSliderIndex = computed({
  get() {
    const iso = form.value.iso
    if (!iso) return 1
    let nearest = 0
    let minDiff = Infinity
    for (let i = 0; i < ISO_STOPS.length; i++) {
      const diff = Math.abs(Math.log2(iso) - Math.log2(ISO_STOPS[i]))
      if (diff < minDiff) { minDiff = diff; nearest = i }
    }
    return nearest
  },
  set(idx: number) {
    form.value.iso = ISO_STOPS[idx]
  }
})

function formatIsoTooltip(idx: number) {
  return `ISO ${ISO_STOPS[idx] ?? idx}`
}

const evSliderStep = computed({
  get() {
    const str = form.value.exposureCompensation
    if (!str) return 0
    const num = parseFloat(str)
    return isNaN(num) ? 0 : Math.round(num * 3)
  },
  set(step: number) {
    const value = step / 3
    const rounded = Math.round(value * 10) / 10
    form.value.exposureCompensation = rounded > 0 ? `+${rounded}` : `${rounded}`
  }
})

function formatEvTooltip(step: number) {
  const value = step / 3
  const rounded = Math.round(value * 10) / 10
  return rounded > 0 ? `+${rounded} EV` : `${rounded} EV`
}

const evDisplayText = computed(() => form.value.exposureCompensation || '0')

const focalLengthNum = computed({
  get(): number | null {
    const str = form.value.focalLength
    if (!str) return null
    const num = parseFloat(str)
    return isNaN(num) ? null : num
  },
  set(val: number | null) {
    form.value.focalLength = val != null ? `${val}mm` : undefined
  }
})

const flashEnabled = computed({
  get() {
    const val = form.value.flash?.toLowerCase()
    return val === 'on' || val === 'fired' || val === 'yes' || val === 'true'
  },
  set(on: boolean) {
    form.value.flash = on ? 'On' : 'Off'
  }
})

const dateTimeTimestamp = computed({
  get(): number | null {
    const str = form.value.dateTimeOriginal
    if (!str) return null
    let ts = new Date(str).getTime()
    if (!isNaN(ts)) return ts
    ts = new Date(str.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3')).getTime()
    return isNaN(ts) ? null : ts
  },
  set(val: number | null) {
    if (val) {
      const d = new Date(val)
      const pad = (n: number) => String(n).padStart(2, '0')
      form.value.dateTimeOriginal =
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    } else {
      form.value.dateTimeOriginal = undefined
    }
  }
})

function onCreateCustomField() {
  return { key: '', val: '' }
}

function addCustomField() {
  customFields.value.push({ key: '', val: '' })
}

function extractCustomFields(data: ExifData) {
  return Object.entries(data)
    .filter(([k]) => !BUILTIN_KEYS.has(k))
    .map(([key, val]) => ({ key, val: String(val ?? '') }))
}

function buildExifData(): ExifData {
  const result: ExifData = {}
  for (const [k, v] of Object.entries(form.value)) {
    if (BUILTIN_KEYS.has(k) && v != null && v !== '') {
      result[k] = v
    }
  }
  for (const { key, val } of customFields.value) {
    if (key.trim()) {
      result[key.trim()] = val
    }
  }
  return result
}

watch(() => props.modelValue, (newVal) => {
  if (suppressSync) return
  form.value = { ...newVal }
  customFields.value = extractCustomFields(newVal)
}, { immediate: true, deep: true })

watch([form, customFields], () => {
  suppressSync = true
  emit('update:modelValue', buildExifData())
  nextTick(() => { suppressSync = false })
}, { deep: true })
</script>
