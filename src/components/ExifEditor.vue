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
          <n-input v-model:value="form.aperture" placeholder="如 f/2.8" />
        </n-form-item-gi>
        <n-form-item-gi label="快门速度">
          <n-input v-model:value="form.shutterSpeed" placeholder="如 1/250" />
        </n-form-item-gi>
        <n-form-item-gi label="ISO">
          <n-input-number v-model:value="form.iso" placeholder="如 400" :show-button="false" style="width: 100%;" />
        </n-form-item-gi>
        <n-form-item-gi label="焦距">
          <n-input v-model:value="form.focalLength" placeholder="如 50mm" />
        </n-form-item-gi>
        <n-form-item-gi label="曝光补偿">
          <n-input v-model:value="form.exposureCompensation" placeholder="如 +0.7" />
        </n-form-item-gi>
        <n-form-item-gi label="白平衡">
          <n-input v-model:value="form.whiteBalance" placeholder="如 Auto" />
        </n-form-item-gi>
        <n-form-item-gi label="测光模式">
          <n-input v-model:value="form.meteringMode" placeholder="如 Evaluative" />
        </n-form-item-gi>
        <n-form-item-gi label="闪光灯">
          <n-input v-model:value="form.flash" placeholder="如 Off" />
        </n-form-item-gi>
        <n-form-item-gi label="拍摄时间">
          <n-input v-model:value="form.dateTimeOriginal" placeholder="如 2024-01-15T10:30:00" />
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

const filteredMakeOptions = computed(() =>
  fuzzyFilter(cameraMakeOptions.value, form.value.cameraMake)
)

const filteredModelOptions = computed(() =>
  fuzzyFilter(cameraModelOptions.value, form.value.cameraModel)
)

const filteredLensOptions = computed(() =>
  fuzzyFilter(lensOptions.value, form.value.lens)
)

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
