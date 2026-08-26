<template>
  <div class="config-page">
    <header class="page-header">
      <div>
        <div class="eyebrow">ADMINISTRATION / RUNTIME</div>
        <div class="title-row">
          <h1>系统配置</h1>
          <n-tag type="success" size="small" :bordered="false" round>固定配置清单</n-tag>
        </div>
        <p class="page-description">只维护系统实际使用的运行参数。配置项由系统预定义，无需新建或删除。</p>
      </div>
      <n-space align="center" :size="10">
        <span v-if="lastUpdatedAt" class="last-updated">最近刷新 {{ lastUpdatedText }}</span>
        <n-button secondary :loading="loading" @click="loadConfigs">
          <template #icon><n-icon :component="RefreshOutline" /></template>
          刷新
        </n-button>
      </n-space>
    </header>

    <n-alert v-if="loadError" type="error" closable class="scope-alert" @close="loadError = ''">
      {{ loadError }}
    </n-alert>
    <n-alert type="info" :show-icon="true" class="scope-alert">
      <strong>这里不管理服务启动参数。</strong>
      数据库、消息队列和 AI 服务密钥仍由环境变量或 YAML 提供；对象存储配置可在本页修改，上传服务会在约 15 秒内自动刷新。
    </n-alert>

    <section class="stats-grid" aria-label="配置概览">
      <div class="stat-item"><div class="stat-icon stat-icon-blue"><n-icon :component="SettingsOutline" /></div><div><span class="stat-label">预定义配置</span><strong>{{ configDefinitions.length }}</strong></div></div>
      <div class="stat-item"><div class="stat-icon stat-icon-green"><n-icon :component="CheckmarkCircleOutline" /></div><div><span class="stat-label">已填写</span><strong>{{ configuredCount }}</strong></div></div>
      <div class="stat-item"><div class="stat-icon stat-icon-orange"><n-icon :component="AlertCircleOutline" /></div><div><span class="stat-label">待填写</span><strong>{{ pendingCount }}</strong></div></div>
      <div class="stat-item"><div class="stat-icon stat-icon-purple"><n-icon :component="ShieldCheckmarkOutline" /></div><div><span class="stat-label">敏感配置</span><strong>{{ sensitiveCount }}</strong></div></div>
    </section>

    <n-card class="config-panel" :bordered="true" content-style="padding: 0;">
      <div class="filter-toolbar">
        <div class="filter-group">
          <n-select v-model:value="selectedCategory" :options="categoryOptions" class="category-filter" />
          <n-input v-model:value="searchKeyword" class="keyword-filter" placeholder="搜索配置名称、键名或说明" clearable>
            <template #prefix><n-icon :component="SearchOutline" /></template>
          </n-input>
          <n-checkbox v-model:checked="pendingOnly">仅显示待填写</n-checkbox>
          <n-button v-if="hasFilters" text type="primary" @click="resetFilters">重置筛选</n-button>
        </div>
        <span class="result-summary">显示 {{ filteredRows.length }} / {{ configDefinitions.length }} 项</span>
      </div>
      <n-data-table class="config-table" :columns="columns" :data="filteredRows" :loading="loading" :pagination="false" :bordered="false" :single-line="false" size="small" :row-key="(row: ConfigRow) => row.category + '-' + row.key">
        <template #empty><n-empty description="没有匹配的预定义配置" /></template>
      </n-data-table>
    </n-card>

    <n-modal v-model:show="showModal" preset="card" :title="editingDefinition?.label ?? '填写配置'" class="config-modal">
      <n-alert v-if="editingDefinition" type="info" :show-icon="false" class="edit-tip">{{ editingDefinition.description }}</n-alert>
      <n-form :model="form" label-placement="top">
        <div class="readonly-meta">
          <div><span class="meta-label">配置键名</span><code>{{ editingDefinition?.category }}.{{ editingDefinition?.key }}</code></div>
          <n-tag size="small" :type="editingDefinition?.encrypted ? 'warning' : 'default'" :bordered="false" round>{{ editingDefinition?.encrypted ? '加密存储' : editingDefinition?.valueType }}</n-tag>
        </div>
        <n-form-item label="配置值" path="value">
          <n-select v-if="editingDefinition?.key === 'active-model'" v-model:value="form.value" :options="modelOptions" placeholder="选择视觉 AI 模型" />
          <n-select v-else-if="editingDefinition?.key === 'presigner_path_style'" v-model:value="form.value" :options="booleanOptions" />
          <n-input v-else v-model:value="form.value" :type="editingDefinition?.encrypted && !secretVisible ? 'password' : 'text'" :placeholder="editingDefinition?.placeholder" show-count maxlength="500">
            <template v-if="editingDefinition?.encrypted" #suffix>
              <n-button text size="tiny" :aria-label="secretVisible ? '隐藏配置值' : '显示配置值'" @click="secretVisible = !secretVisible"><template #icon><n-icon :component="secretVisible ? EyeOffOutline : EyeOutline" /></template></n-button>
            </template>
          </n-input>
          <span class="field-hint">{{ editHelp }}</span>
        </n-form-item>
      </n-form>
      <template #footer>
        <div class="modal-footer">
          <span class="modal-footer-hint"><n-icon :component="LockClosedOutline" />敏感值只会在当前会话中临时显示</span>
          <n-space><n-button @click="showModal = false">取消</n-button><n-button type="primary" :loading="saving" @click="handleSubmit">保存配置</n-button></n-space>
        </div>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, reactive, ref } from 'vue'
import { NButton, NIcon, NTag, NEllipsis, useMessage, type DataTableColumns } from 'naive-ui'
import { AlertCircleOutline, CheckmarkCircleOutline, CopyOutline, CreateOutline, EyeOffOutline, EyeOutline, KeyOutline, LockClosedOutline, RefreshOutline, SearchOutline, SettingsOutline, ShieldCheckmarkOutline } from '@vicons/ionicons5'
import { fetchManagedConfigs, upsertConfig, updateConfig, type SystemConfigVO } from '../api/systemConfig'

type ConfigValueType = 'string' | 'encrypted' | 'boolean'
interface ConfigDefinition { category: string; categoryLabel: string; key: string; label: string; description: string; help: string; placeholder: string; valueType: ConfigValueType; encrypted: boolean; required: boolean }
interface ConfigRow extends ConfigDefinition { id: number; value: string; updatedAt: string; configured: boolean; source: SystemConfigVO | null }

const configDefinitions: ConfigDefinition[] = [
  { category: 'storage', categoryLabel: '对象存储', key: 'access_key_id', label: 'Access Key ID', description: '对象存储 S3 API 身份凭据，与 Secret Access Key 配套使用。', help: '保存后加密存储，管理页面不会再次回显明文。', placeholder: '填写 Access Key ID', valueType: 'encrypted', encrypted: true, required: true },
  { category: 'storage', categoryLabel: '对象存储', key: 'secret_access_key', label: 'Secret Access Key', description: '对象存储 S3 API 密钥，用于签名上传和管理请求。', help: '保存后加密存储，管理页面不会再次回显明文。', placeholder: '填写 Secret Access Key', valueType: 'encrypted', encrypted: true, required: true },
  { category: 'storage', categoryLabel: '对象存储', key: 'region', label: '存储区域', description: 'S3 兼容存储的区域标识。Cloudflare R2 固定使用 auto。', help: 'Cloudflare R2 请填写 auto。', placeholder: 'auto', valueType: 'string', encrypted: false, required: true },
  { category: 'storage', categoryLabel: '对象存储', key: 'endpoint', label: 'S3 API Endpoint', description: '服务端访问对象存储所用的 S3 兼容 API 地址。', help: '例如 https://<account-id>.r2.cloudflarestorage.com。', placeholder: 'https://account-id.r2.cloudflarestorage.com', valueType: 'string', encrypted: false, required: true },
  { category: 'storage', categoryLabel: '对象存储', key: 'presigner_endpoint', label: '预签名 Endpoint', description: '浏览器上传使用的预签名地址；不填写时回退到 S3 API Endpoint。', help: '通常与 S3 API Endpoint 相同。公开 CDN 域名不能用于认证上传。', placeholder: '留空则使用 S3 API Endpoint', valueType: 'string', encrypted: false, required: false },
  { category: 'storage', categoryLabel: '对象存储', key: 'presigner_path_style', label: 'Path-style 预签名', description: '控制预签名 URL 是否使用 endpoint/bucket/key 路径格式。', help: 'Cloudflare R2 建议保持 true。', placeholder: 'true', valueType: 'boolean', encrypted: false, required: true },
  { category: 'storage', categoryLabel: '对象存储', key: 'bucket', label: 'Bucket 名称', description: '上传、分片管理和删除操作使用的对象存储桶。', help: '必须与对象存储中实际创建的 Bucket 名称一致。', placeholder: 'albireo', valueType: 'string', encrypted: false, required: true },
  { category: 'storage', categoryLabel: '对象存储', key: 'custom_domain', label: '媒体 CDN 域名', description: '图片、视频和缩略图的公开访问域名，前端会使用它拼接媒体地址。', help: '例如 https://albireo.shuumatu.com，不要填写末尾路径。', placeholder: 'https://cdn.example.com', valueType: 'string', encrypted: false, required: true },
  { category: 'vision-ai', categoryLabel: '视觉 AI', key: 'active-model', label: '当前视觉 AI 模型', description: '选择视频分析任务使用的视觉模型，也可以在“视觉模型管理”页面切换。', help: '切换后只影响后续提交的分析任务。', placeholder: '选择视觉 AI 模型', valueType: 'string', encrypted: false, required: true },
  { category: 'geocoding', categoryLabel: '地理编码', key: 'amap_key', label: '高德 Web 服务 API Key', description: '用于根据媒体 GPS 信息获取省市和地点名称。留空时自动跳过外部地理编码。', help: '可选配置；高德 Key 会使用 AES 加密存储。', placeholder: '填写高德 Web 服务 API Key（可选）', valueType: 'encrypted', encrypted: true, required: false },
]
const modelOptions = [{ label: '智谱 Flash（免费）', value: 'zhipu' }, { label: '智谱 FlashX（付费）', value: 'zhipu-flashx' }, { label: 'Google Gemini', value: 'gemini' }, { label: 'Twelve Labs', value: 'twelvelabs' }]
const booleanOptions = [{ label: '启用（true）', value: 'true' }, { label: '关闭（false）', value: 'false' }]
const message = useMessage()
const configs = ref<SystemConfigVO[]>([])
const loading = ref(false)
const saving = ref(false)
const loadError = ref('')
const lastUpdatedAt = ref<number | null>(null)
const selectedCategory = ref('all')
const searchKeyword = ref('')
const pendingOnly = ref(false)
const showModal = ref(false)
const secretVisible = ref(false)
const editingDefinition = ref<ConfigDefinition | null>(null)
const editingRow = ref<ConfigRow | null>(null)
const form = reactive({ value: '' })
const categoryOptions = [{ label: '全部配置', value: 'all' }, { label: '对象存储', value: 'storage' }, { label: '视觉 AI', value: 'vision-ai' }, { label: '地理编码', value: 'geocoding' }]
const hasFilters = computed(() => selectedCategory.value !== 'all' || pendingOnly.value || !!searchKeyword.value.trim())
const rows = computed<ConfigRow[]>(() => configDefinitions.map(definition => {
  const source = configs.value.find(item => item.category === definition.category && item.key === definition.key) ?? null
  return { ...definition, id: source?.id ?? 0, value: source?.value ?? '', updatedAt: source?.updatedAt ?? '', configured: source?.configured ?? Boolean(source?.value?.trim()), source }
}))
const filteredRows = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  return rows.value.filter(row => (selectedCategory.value === 'all' || row.category === selectedCategory.value) && (!pendingOnly.value || !row.configured) && (!keyword || (row.label + ' ' + row.key + ' ' + row.category + ' ' + row.description).toLowerCase().includes(keyword)))
})
const configuredCount = computed(() => rows.value.filter(row => row.configured).length)
const pendingCount = computed(() => rows.value.filter(row => !row.configured && row.required).length)
const sensitiveCount = computed(() => rows.value.filter(row => row.encrypted).length)
const lastUpdatedText = computed(() => lastUpdatedAt.value ? new Date(lastUpdatedAt.value).toLocaleTimeString('zh-CN', { hour12: false }) : '')
const editHelp = computed(() => editingDefinition.value?.encrypted && editingRow.value?.configured ? editingDefinition.value.help + ' 已配置；留空将保持原值。' : editingDefinition.value?.help ?? '')
function formatDate(value: string) { if (!value) return '尚未保存'; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false }) }
async function copyValue(row: ConfigRow) { try { await navigator.clipboard.writeText(row.value); message.success('配置值已复制') } catch { message.error('复制失败，请检查浏览器权限') } }
function displayValue(row: ConfigRow) { return !row.configured ? '待填写' : row.encrypted ? '••••••••' : row.value }
const columns: DataTableColumns<ConfigRow> = [
  { title: '配置项', key: 'label', minWidth: 270, render: row => h('div', { class: 'config-key-cell' }, [h('div', { class: 'config-key' }, [h(NIcon, { size: 16, component: KeyOutline }), h('span', row.label), h(NTag, { type: row.required ? 'warning' : 'default', size: 'tiny', bordered: false, round: true }, { default: () => row.required ? '必填' : '可选' })]), h('span', { class: 'config-category' }, row.categoryLabel + ' / ' + row.category + '.' + row.key)]) },
  { title: '配置值', key: 'value', minWidth: 280, render: row => h('div', { class: 'value-cell' }, [h(NEllipsis, { class: row.configured ? 'value-text' : 'value-text pending-value', lineClamp: 2, tooltip: row.configured && !row.encrypted }, { default: () => displayValue(row) }), row.configured && !row.encrypted ? h(NButton, { text: true, size: 'tiny', ariaLabel: '复制配置值', onClick: () => copyValue(row) }, { icon: () => h(NIcon, { component: CopyOutline }) }) : null]) },
  { title: '类型', key: 'valueType', width: 120, render: row => h(NTag, { type: row.encrypted ? 'warning' : 'default', size: 'small', bordered: false, round: true }, { default: () => row.encrypted ? 'encrypted' : row.valueType }) },
  { title: '说明', key: 'description', minWidth: 280, render: row => h(NEllipsis, { tooltip: true }, { default: () => row.description }) },
  { title: '最近更新', key: 'updatedAt', width: 170, render: row => formatDate(row.updatedAt) },
  { title: '操作', key: 'actions', width: 110, render: row => h(NButton, { text: true, type: 'primary', size: 'small', onClick: () => handleEdit(row) }, { icon: () => h(NIcon, { component: CreateOutline }), default: () => row.configured ? '编辑' : '填写' }) },
]
async function loadConfigs() {
  loading.value = true
  loadError.value = ''
  try { const result = await fetchManagedConfigs(); configs.value = Array.isArray(result) ? result : []; lastUpdatedAt.value = Date.now() }
  catch (err) { console.error('加载配置失败:', err); loadError.value = '获取配置失败，请检查服务连接后重试。'; configs.value = [] }
  finally { loading.value = false }
}
function resetFilters() { selectedCategory.value = 'all'; searchKeyword.value = ''; pendingOnly.value = false }
function handleEdit(row: ConfigRow) { editingDefinition.value = row; editingRow.value = row; form.value = row.encrypted ? '' : row.value ?? ''; secretVisible.value = false; showModal.value = true }
async function handleSubmit() {
  if (!editingDefinition.value || !editingRow.value) return
  const value = form.value.trim()
  if (editingDefinition.value.encrypted && editingRow.value.configured && !value) { showModal.value = false; message.info('密钥未修改'); return }
  if (editingDefinition.value.required && !value) { message.warning('此配置为必填项'); return }
  if (['custom_domain', 'endpoint'].includes(editingDefinition.value.key) && !/^https?:\/\/[^\s/]+\/?$/.test(value)) {
    message.warning('请输入完整的 HTTP/HTTPS 域名，不要包含路径')
    return
  }
  if (editingDefinition.value.key === 'presigner_endpoint' && value && !/^https?:\/\/[^\s/]+\/?$/.test(value)) { message.warning('请输入完整的 HTTP/HTTPS Endpoint，不要包含路径'); return }
  if (editingDefinition.value.key === 'active-model' && !modelOptions.some(option => option.value === value)) {
    message.warning('请选择有效的视觉 AI 模型')
    return
  }
  saving.value = true
  try {
    const definition = editingDefinition.value
    const row = editingRow.value
    if (row.source) await updateConfig(definition.category, definition.key, { value })
    else await upsertConfig({ category: definition.category, key: definition.key, value, valueType: definition.valueType, isEncrypted: definition.encrypted, description: definition.description })
    message.success('配置已保存'); showModal.value = false; await loadConfigs()
  } catch (err) { console.error(err); message.error('保存失败，请稍后重试') }
  finally { saving.value = false }
}
onMounted(loadConfigs)
</script>

<style scoped>
.config-page { max-width: 1440px; margin: 0 auto; padding: 28px 32px 48px; color: var(--n-text-color); }
.page-header { display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; margin-bottom: 20px; }
.eyebrow { color: var(--n-text-color-3); font-size: 11px; font-weight: 700; letter-spacing: 1.2px; margin-bottom: 8px; }
.title-row { display: flex; align-items: center; gap: 10px; } h1 { margin: 0; font-size: 26px; line-height: 1.2; font-weight: 700; }
.page-description { color: var(--n-text-color-2); margin: 8px 0 0; font-size: 13px; } .last-updated { color: var(--n-text-color-3); font-size: 12px; }
.scope-alert { margin-bottom: 20px; } .stats-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 20px 0; }
.stat-item { display: flex; align-items: center; gap: 13px; padding: 17px 18px; background: var(--n-card-color); border: 1px solid var(--n-divider-color); border-radius: 8px; }
.stat-icon { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 8px; font-size: 18px; } .stat-icon-blue { color: #2563eb; background: #eff6ff; } .stat-icon-purple { color: #7c3aed; background: #f5f3ff; } .stat-icon-orange { color: #d97706; background: #fffbeb; } .stat-icon-green { color: #059669; background: #ecfdf5; }
.stat-label { display: block; color: var(--n-text-color-3); font-size: 12px; margin-bottom: 2px; } .stat-item strong { font-size: 22px; line-height: 1; }
.config-panel { overflow: hidden; } .filter-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 16px 18px; border-bottom: 1px solid var(--n-divider-color); }
.filter-group { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; } .category-filter { width: 170px; } .keyword-filter { width: 280px; } .result-summary { color: var(--n-text-color-3); font-size: 12px; white-space: nowrap; }
.config-table :deep(.n-data-table-td) { padding-top: 13px; padding-bottom: 13px; } .config-key-cell { display: flex; flex-direction: column; gap: 4px; } .config-key { display: flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 600; } .config-category { color: var(--n-text-color-3); font-family: 'JetBrains Mono', 'Consolas', monospace; font-size: 11px; }
.value-cell { display: flex; align-items: center; gap: 4px; min-width: 0; } .value-text { flex: 1; font-family: 'JetBrains Mono', 'Consolas', monospace; font-size: 12px; } .pending-value { color: var(--n-warning-color); font-family: inherit; }
.config-modal { width: min(560px, calc(100vw - 32px)); } .edit-tip { margin-bottom: 18px; } .readonly-meta { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 11px 13px; margin-bottom: 18px; background: var(--n-color-embedded); border-radius: 6px; }
.meta-label { display: block; color: var(--n-text-color-3); font-size: 11px; margin-bottom: 3px; } .readonly-meta code { color: var(--n-text-color); font-family: 'JetBrains Mono', 'Consolas', monospace; font-size: 12px; } .field-hint { display: block; margin-top: 6px; color: var(--n-text-color-3); font-size: 12px; }
.modal-footer { display: flex; align-items: center; justify-content: space-between; gap: 16px; } .modal-footer-hint { display: flex; align-items: center; gap: 5px; color: var(--n-text-color-3); font-size: 11px; }
@media (max-width: 820px) { .config-page { padding: 20px 16px 36px; } .page-header { align-items: flex-start; flex-direction: column; } .stats-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .filter-toolbar { align-items: flex-start; flex-direction: column; } .filter-group { width: 100%; } .category-filter, .keyword-filter { flex: 1; min-width: 180px; } .result-summary { align-self: flex-end; } .modal-footer { align-items: flex-end; flex-direction: column; } .modal-footer-hint { align-self: flex-start; } }
@media (max-width: 480px) { .stats-grid { gap: 8px; } .stat-item { padding: 13px 12px; gap: 9px; } .stat-icon { width: 30px; height: 30px; font-size: 16px; } .stat-item strong { font-size: 19px; } .page-description { max-width: 300px; } }
</style>
