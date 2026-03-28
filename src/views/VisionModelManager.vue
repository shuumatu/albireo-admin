<template>
  <div class="p-8">
    <n-card title="视觉模型管理" class="max-w-2xl mx-auto">
      <n-spin :show="loading">
        <n-flex vertical :size="24">
          <n-flex align="center" :size="12">
            <span>当前模型：</span>
            <n-tag :type="currentModel === 'gemini' ? 'success' : 'info'" size="large">
              {{ modelLabels[currentModel] ?? currentModel ?? '未知' }}
            </n-tag>
          </n-flex>

          <n-radio-group v-model:value="selectedModel" size="large">
            <n-flex :size="16">
              <n-radio-button
                v-for="item in modelOptions"
                :key="item.value"
                :value="item.value"
              >
                {{ item.label }}
              </n-radio-button>
            </n-flex>
          </n-radio-group>

          <n-flex>
            <n-button
              type="primary"
              :disabled="selectedModel === currentModel"
              :loading="switching"
              @click="handleSwitch"
            >
              切换模型
            </n-button>
          </n-flex>
        </n-flex>
      </n-spin>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useMessage } from 'naive-ui'
import { getVisionModel, switchVisionModel } from '../api/visionModel'

const message = useMessage()

const modelLabels: Record<string, string> = {
  zhipu: '智谱 AI (glm-4.6v-flash)',
  gemini: 'Google Gemini 3 Flash Preview'
}

const modelOptions = [
  { label: '智谱 AI', value: 'zhipu' },
  { label: 'Google Gemini', value: 'gemini' }
]

const currentModel = ref<string | null>(null)
const selectedModel = ref<string>('zhipu')
const loading = ref(false)
const switching = ref(false)

async function loadCurrentModel() {
  loading.value = true
  try {
    const res: any = await getVisionModel()
    const model = res.data ?? res
    currentModel.value = typeof model === 'string' ? model : 'zhipu'
    selectedModel.value = currentModel.value!
  } catch {
    message.error('获取当前模型失败')
  } finally {
    loading.value = false
  }
}

async function handleSwitch() {
  switching.value = true
  try {
    await switchVisionModel(selectedModel.value)
    currentModel.value = selectedModel.value
    message.success(`已切换到: ${modelLabels[selectedModel.value] ?? selectedModel.value}`)
  } catch {
    message.error('切换模型失败')
    selectedModel.value = currentModel.value ?? 'zhipu'
  } finally {
    switching.value = false
  }
}

onMounted(() => {
  loadCurrentModel()
})
</script>
