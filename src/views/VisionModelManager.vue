<template>
  <div class="vision-page admin-page">
    <header class="admin-page-header vision-header">
      <div><span class="eyebrow">AI / VISION</span><h1>视觉模型管理</h1><p>为新提交的分析任务选择模型，集中查看和切换当前配置。</p></div>
      <n-button secondary :loading="loading" :disabled="switching" @click="loadCurrentModel">刷新状态</n-button>
    </header>
    <n-alert v-if="loadError" type="error" class="notice">{{ loadError }}</n-alert>
    <section class="current-model admin-panel">
      <span class="current-icon">AI</span>
      <div><span class="muted">当前使用的模型</span><h2>{{ loading && !currentModel ? '正在获取配置…' : currentModel ? (modelLabels[currentModel] ?? currentModel) : '暂未获取' }}</h2></div>
      <n-tag v-if="currentModel" type="success" :bordered="false" round>已生效</n-tag>
    </section>
    <section class="model-panel admin-panel">
      <div class="section-heading"><h2>选择分析模型</h2><span class="muted">{{ modelOptions.length }} 个可选模型</span></div>
      <n-radio-group v-model:value="selectedModel" :disabled="loading || switching" class="model-options" aria-label="选择视觉分析模型">
        <label v-for="item in modelOptions" :key="item.value" class="model-option" :class="{ selected: selectedModel === item.value }">
          <n-radio :value="item.value"><strong>{{ item.label }}</strong></n-radio>
          <span class="option-description">{{ descriptions[item.value] }}</span>
          <span class="option-state">{{ currentModel === item.value ? '正在使用' : selectedModel === item.value ? '已选择，保存后生效' : '点击选择' }}</span>
        </label>
      </n-radio-group>
      <n-alert type="info" :show-icon="true" class="notice">切换只影响后续提交的分析任务。已有描述可通过重新分析更新；免费模型在访问高峰可能暂时不可用。</n-alert>
      <div class="save-bar"><span class="muted">{{ hasChanges ? '模型选择尚未保存' : '当前配置已同步' }}</span><n-space><n-button v-if="hasChanges" :disabled="switching" @click="selectedModel = currentModel">恢复当前选择</n-button><n-button type="primary" :disabled="!hasChanges || loading || !currentModel" :loading="switching" @click="handleSwitch">保存并切换模型</n-button></n-space></div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useMessage } from 'naive-ui'
import { getVisionModel, switchVisionModel } from '../api/visionModel'
import { visionModelOptions as modelOptions, visionModelLabels as modelLabels } from '../constants/visionModels'

const message = useMessage()
const currentModel = ref<string | null>(null)
const selectedModel = ref<string | null>(null)
const loading = ref(false)
const switching = ref(false)
const loadError = ref('')
const hasChanges = computed(() => !!selectedModel.value && selectedModel.value !== currentModel.value)
const descriptions: Record<string, string> = { zhipu: '智谱视觉模型 · 免费版', 'zhipu-flashx': '智谱视觉模型 · FlashX', gemini: 'Google Gemini 视觉分析', twelvelabs: 'Twelve Labs 视频理解' }

async function loadCurrentModel() {
  if (loading.value || switching.value) return
  loading.value = true
  try {
    const res: any = await getVisionModel()
    const model = res.data ?? res
    if (typeof model !== 'string' || !model) throw new Error('无有效模型配置')
    currentModel.value = model
    selectedModel.value = model
    loadError.value = ''
  } catch {
    loadError.value = '获取当前模型失败，请刷新重试。已有选择已保留。'
  } finally {
    loading.value = false
  }
}

async function handleSwitch() {
  if (switching.value || loading.value || !hasChanges.value || !selectedModel.value) return
  const model = selectedModel.value
  switching.value = true
  try {
    await switchVisionModel(model)
    currentModel.value = model
    message.success('已切换到 ' + (modelLabels[model] ?? model))
  } catch {
    message.error('切换失败，已保留你的选择，可再次保存')
  } finally {
    switching.value = false
  }
}
onMounted(loadCurrentModel)
</script>

<style scoped>
.vision-page { max-width: 1200px; margin: auto; padding: 28px 32px 48px; }
.vision-header { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 24px; }
.eyebrow { color: var(--n-text-color-3); font-size: 11px; letter-spacing: 1.5px; font-weight: 700; }
h1 { margin: 7px 0 8px; font-size: 26px; } h2 { margin: 0; font-size: 18px; } p,.muted { color: var(--n-text-color-3); font-size: 13px; } p { margin: 0; }
.current-model,.model-panel { padding: 24px; border: 1px solid var(--n-divider-color); border-radius: 14px; background: var(--n-card-color); }
.current-model { display: flex; gap: 18px; align-items: center; margin-bottom: 20px; } .current-model h2 { margin-top: 4px; }.current-model .n-tag { margin-left: auto; }
.current-icon { width: 52px; height: 52px; border-radius: 14px; display: grid; place-items: center; background: var(--admin-accent-soft, #e6f3e9); color: var(--admin-accent, #2f7b5b); font-weight: 800; }
.section-heading,.save-bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; }.section-heading { margin-bottom: 20px; }
.model-options { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 14px; width: 100%; }
.model-option { display: flex; flex-direction: column; gap: 13px; border: 1px solid var(--n-divider-color); border-radius: 12px; padding: 20px; cursor: pointer; transition: border-color .18s, background-color .18s, transform .18s; }
.model-option:hover { border-color: var(--admin-focus, #91cba3); transform: translateY(-2px); }.model-option.selected { border-color: var(--admin-accent, #2f7b5b); background: var(--admin-hover, #f0f7ef); }.option-description { color: var(--n-text-color-3); font-size: 13px; padding-left: 24px; }.option-state { font-size: 12px; padding-left: 24px; color: var(--admin-accent, #2f7b5b); }.notice { margin: 20px 0; }.save-bar { border-top: 1px solid var(--n-divider-color); padding-top: 20px; }
@media(max-width:680px) { .vision-page { padding: 20px 16px; }.vision-header,.save-bar { align-items: flex-start; flex-direction: column; }.model-options { grid-template-columns: 1fr; }.current-model,.model-panel { padding: 18px; }.current-model { flex-wrap: wrap; } }
@media(prefers-reduced-motion:reduce) { .model-option { transition: none; }.model-option:hover { transform: none; } }
</style>
