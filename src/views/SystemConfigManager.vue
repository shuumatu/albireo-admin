<template>
  <div class="p-8">
    <n-card title="系统配置管理" class="max-w-6xl mx-auto">
      <div class="function-area">
        <n-flex align="center" wrap>
          <n-select
            v-model:value="selectedCategory"
            :options="categoryOptions"
            style="width: 220px"
          />
          <n-input
            v-model:value="searchKeyword"
            placeholder="搜索键名或描述..."
            style="width: 260px"
            clearable
          />
          <n-button type="primary" @click="handleSearch">刷新</n-button>
          <n-button type="primary" ghost @click="handleAddConfig">新建配置</n-button>
        </n-flex>
      </div>

      <n-data-table
        :remote="!searchKeyword.trim()"
        :columns="columns"
        :data="displayConfigs"
        :loading="loading"
        :pagination="pagination"
        :bordered="false"
        :row-key="(row: SystemConfigVO) => `${row.category}-${row.key}`"
      />
    </n-card>

    <!-- 新建 / 编辑配置弹窗 -->
    <n-modal
      v-model:show="showModal"
      :title="isEdit ? '编辑配置' : '新建配置'"
      preset="card"
      style="width: 560px"
    >
      <n-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="96"
      >
        <n-form-item label="分类" path="category">
          <n-select
            v-model:value="form.category"
            :options="categorySelectOptions"
            placeholder="选择或输入分类"
            filterable
            tag
          />
        </n-form-item>
        <n-form-item label="键名" path="key">
          <n-input
            v-model:value="form.key"
            placeholder="如：site_name、endpoint"
            :disabled="isEdit"
          />
        </n-form-item>
        <n-form-item label="值" path="value">
          <n-input
            v-model:value="form.value"
            type="textarea"
            placeholder="配置值（加密字段会自动加密存储）"
            :rows="4"
          />
        </n-form-item>
        <n-form-item label="值类型" path="valueType">
          <n-select
            v-model:value="form.valueType"
            :options="valueTypeOptions"
            style="width: 200px"
          />
        </n-form-item>
        <n-form-item label="加密存储" path="isEncrypted">
          <n-switch v-model:value="form.isEncrypted" />
        </n-form-item>
        <n-form-item label="说明" path="description">
          <n-input
            v-model:value="form.description"
            type="textarea"
            placeholder="配置项说明（可选）"
            :rows="2"
          />
        </n-form-item>
        <n-form-item label="元数据" path="metadata">
          <n-input
            v-model:value="form.metadata"
            type="textarea"
            placeholder='扩展元数据（JSON 字符串，如 {"region":"us-east-1"}）'
            :rows="2"
          />
        </n-form-item>
      </n-form>
      <template #action>
        <n-space>
          <n-button @click="showModal = false">取消</n-button>
          <n-button type="primary" @click="handleSubmit">保存</n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, h, computed, onMounted, watch } from 'vue'
import {
  NButton,
  NPopconfirm,
  NTag,
  useMessage,
  type FormInst,
  type DataTableColumns
} from 'naive-ui'
import {
  fetchAllConfigs,
  fetchAllConfigsWithPagination,
  fetchConfigsByCategory,
  fetchConfigsByCategoryWithPagination,
  upsertConfig,
  updateConfig,
  deleteConfig,
  type SystemConfigVO
} from '../api/systemConfig'

const message = useMessage()

const categoryOptions = [
  { label: '全部分类', value: 'all' },
  { label: '存储配置（storage）', value: 'storage' },
  { label: 'AI API（ai_api）', value: 'ai_api' },
  { label: '视觉 AI（ai_vision）', value: 'ai_vision' },
  { label: '转码配置（transcoding）', value: 'transcoding' },
  { label: '系统配置（system）', value: 'system' }
]

const categorySelectOptions = [
  { label: 'storage', value: 'storage' },
  { label: 'ai_api', value: 'ai_api' },
  { label: 'ai_vision', value: 'ai_vision' },
  { label: 'transcoding', value: 'transcoding' },
  { label: 'system', value: 'system' }
]

const valueTypeOptions = [
  { label: 'string', value: 'string' },
  { label: 'number', value: 'number' },
  { label: 'boolean', value: 'boolean' },
  { label: 'json', value: 'json' },
  { label: 'encrypted', value: 'encrypted' }
]

const configs = ref<SystemConfigVO[]>([])
const total = ref(0)
const loading = ref(false)
const selectedCategory = ref<string>('all')
const searchKeyword = ref('')
const currentPage = ref(1)
const pageSize = ref(20)

const showModal = ref(false)
const isEdit = ref(false)
const editingConfig = ref<SystemConfigVO | null>(null)
const formRef = ref<FormInst | null>(null)

const form = reactive({
  category: '',
  key: '',
  value: '',
  valueType: 'string',
  isEncrypted: false,
  description: '',
  metadata: ''
})

const rules = {
  category: [{ required: true, message: '请选择或输入分类', trigger: 'blur' }],
  key: [{ required: true, message: '请输入键名', trigger: 'blur' }],
  value: [{ required: true, message: '请输入配置值', trigger: 'blur' }]
}

const visibleSecretIds = ref<number[]>([])

function toggleSecretVisible(id: number) {
  if (visibleSecretIds.value.includes(id)) {
    visibleSecretIds.value = visibleSecretIds.value.filter(item => item !== id)
  } else {
    visibleSecretIds.value.push(id)
  }
}

const columns: DataTableColumns<SystemConfigVO> = [
  {
    title: '分类',
    key: 'category',
    width: 140
  },
  {
    title: '键名',
    key: 'key',
    width: 200
  },
  {
    title: '值',
    key: 'value',
    render(row) {
      const isSecret = row.isEncrypted || row.valueType === 'encrypted'
      const visible = visibleSecretIds.value.includes(row.id)
      const display = isSecret && !visible ? '******' : row.value

      if (!isSecret) {
        return display
      }

      return h(
        'div',
        { style: 'display: flex; align-items: center; gap: 8px;' },
        [
          h('span', display),
          h(
            NButton,
            {
              text: true,
              type: 'primary',
              size: 'tiny',
              onClick: () => toggleSecretVisible(row.id)
            },
            { default: () => (visible ? '隐藏' : '显示') }
          )
        ]
      )
    }
  },
  {
    title: '类型',
    key: 'valueType',
    width: 120,
    render(row) {
      return h(
        NTag,
        { type: row.valueType === 'encrypted' ? 'warning' : 'default', size: 'small' },
        { default: () => row.valueType }
      )
    }
  },
  {
    title: '说明',
    key: 'description',
    ellipsis: {
      tooltip: true
    }
  },
  {
    title: '更新时间',
    key: 'updatedAt',
    width: 180,
    render: row => new Date(row.updatedAt).toLocaleString('zh-CN')
  },
  {
    title: '操作',
    key: 'actions',
    width: 180,
    render(row) {
      return [
        h(
          NButton,
          {
            size: 'small',
            style: { marginRight: '8px' },
            onClick: () => handleEdit(row)
          },
          { default: () => '编辑' }
        ),
        h(
          NPopconfirm,
          {
            onPositiveClick: () => handleDelete(row),
            positiveText: '删除',
            negativeText: '取消'
          },
          {
            default: () => '确认要删除该配置吗？',
            trigger: () =>
              h(
                NButton,
                {
                  size: 'small',
                  type: 'error'
                },
                { default: () => '删除' }
              )
          }
        )
      ]
    }
  }
]

// 前端关键词搜索过滤（后端暂不支持关键词搜索，使用前端过滤）
// 使用 computed 缓存过滤结果，提升性能
const filteredConfigs = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  if (!keyword) {
    return configs.value
  }
  
  // 优化：提前计算小写值，避免重复转换
  return configs.value.filter((item) => {
    const itemKey = item.key.toLowerCase()
    const itemDesc = (item.description || '').toLowerCase()
    const itemCategory = item.category.toLowerCase()
    
    return (
      itemKey.includes(keyword) ||
      itemDesc.includes(keyword) ||
      itemCategory.includes(keyword)
    )
  })
})

// 最终显示的数据：
// - 搜索模式（remote: false）：传入全部过滤后的数据，让 DataTable 自己分页
// - 正常模式（remote: true）：直接使用后端分页的数据
const displayConfigs = computed(() => {
  const keyword = searchKeyword.value.trim()
  if (keyword) {
    // 搜索模式：返回全部过滤后的数据，DataTable 会根据 pagination 自动分页
    return filteredConfigs.value
  }
  // 正常模式：直接使用后端分页的数据
  return configs.value
})

// 分页配置（使用 computed，参考 VideoMetaManager 的实现）
const pagination = computed(() => {
  const keyword = searchKeyword.value.trim()
  // 搜索模式下，使用过滤后的数据长度；否则使用后端返回的总数
  const itemCount = keyword ? filteredConfigs.value.length : total.value
  
  return {
    page: currentPage.value,
    pageSize: pageSize.value,
    itemCount: itemCount,
    showSizePicker: true,
    pageSizes: [10, 20, 50, 100],
    onChange: (page: number) => {
      currentPage.value = page
      // 如果有关键词搜索，前端过滤不需要重新加载（前端分页）
      // 如果没有关键词，重新加载后端数据（后端分页）
      const keyword = searchKeyword.value.trim()
      if (!keyword) {
        loadConfigs()
      }
      // 搜索模式下，currentPage 变化时，displayConfigs 会自动重新计算
    },
    onUpdatePageSize: (size: number) => {
      pageSize.value = size
      currentPage.value = 1
      // 如果有关键词搜索，前端过滤不需要重新加载（前端分页）
      // 如果没有关键词，重新加载后端数据（后端分页）
      const keyword = searchKeyword.value.trim()
      if (!keyword) {
        loadConfigs()
      }
      // 搜索模式下，pageSize 变化时，displayConfigs 会自动重新计算
    }
  }
})

// 监听分类变化，自动加载数据
watch(selectedCategory, () => {
  currentPage.value = 1 // 切换分类时重置到第一页
  loadConfigs()
})

// 搜索防抖定时器
let searchTimer: ReturnType<typeof setTimeout> | null = null

// 监听搜索关键词变化（使用防抖，避免频繁请求）
watch(searchKeyword, (newVal, oldVal) => {
  // 清除之前的定时器
  if (searchTimer) {
    clearTimeout(searchTimer)
  }
  
  // 设置防抖，300ms 后执行（减少延迟，提升响应速度）
  searchTimer = setTimeout(() => {
    const newKeyword = newVal.trim()
    const oldKeyword = oldVal?.trim() || ''
    
    // 如果从有关键词变为无关键词（清空搜索），重新加载后端分页数据
    if (oldKeyword && !newKeyword) {
      currentPage.value = 1
      loadConfigs()
    }
    // 如果从无关键词变为有关键词（开始搜索），加载所有数据
    else if (!oldKeyword && newKeyword) {
      currentPage.value = 1
      loadConfigs()
    }
    // 如果关键词变化（但都不是空），重新加载所有数据
    else if (newKeyword && oldKeyword && newKeyword !== oldKeyword) {
      currentPage.value = 1
      loadConfigs()
    }
  }, 300)
})

async function loadConfigs() {
  loading.value = true
  try {
    const keyword = searchKeyword.value.trim()
    
    // 如果有关键词搜索，加载所有数据（不分页）进行前端过滤
    // 如果没有关键词，使用后端分页
    if (keyword) {
      // 搜索模式：加载所有数据
      let allData: SystemConfigVO[]
      if (!selectedCategory.value || selectedCategory.value === 'all') {
        allData = await fetchAllConfigs()
      } else {
        allData = await fetchConfigsByCategory(selectedCategory.value)
      }
      configs.value = allData
      total.value = allData.length
    } else {
      // 正常模式：使用后端分页
      let result
      if (!selectedCategory.value || selectedCategory.value === 'all') {
        result = await fetchAllConfigsWithPagination(currentPage.value, pageSize.value)
      } else {
        result = await fetchConfigsByCategoryWithPagination(
          selectedCategory.value,
          currentPage.value,
          pageSize.value
        )
      }
      configs.value = result.data
      total.value = result.total
    }
  } catch (err) {
    console.error('加载配置失败:', err)
    message.error('获取配置失败')
    configs.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  currentPage.value = 1 // 搜索时重置到第一页
  loadConfigs()
}

function resetForm() {
  form.category = selectedCategory.value === 'all' ? '' : selectedCategory.value
  form.key = ''
  form.value = ''
  form.valueType = 'string'
  form.isEncrypted = false
  form.description = ''
  form.metadata = ''
}

function handleAddConfig() {
  isEdit.value = false
  editingConfig.value = null
  resetForm()
  showModal.value = true
}

function handleEdit(row: SystemConfigVO) {
  isEdit.value = true
  editingConfig.value = row
  form.category = row.category
  form.key = row.key
  form.value = row.value
  form.valueType = row.valueType || 'string'
  form.isEncrypted = row.isEncrypted
  form.description = row.description || ''
  form.metadata = row.metadata || ''
  showModal.value = true
}

async function handleDelete(row: SystemConfigVO) {
  try {
    await deleteConfig(row.category, row.key)
    message.success('删除成功')
    await loadConfigs()
  } catch (err) {
    console.error(err)
    message.error('删除失败')
  }
}

function handleSubmit() {
  formRef.value?.validate(async (errors) => {
    if (errors) return

    const payload = {
      category: form.category.trim(),
      key: form.key.trim(),
      value: form.value,
      valueType: form.valueType,
      isEncrypted: form.isEncrypted,
      description: form.description || undefined,
      metadata: form.metadata || undefined
    }

    try {
      if (isEdit.value && editingConfig.value) {
        await updateConfig(editingConfig.value.category, editingConfig.value.key, {
          value: payload.value,
          description: payload.description,
          metadata: payload.metadata
        })
      } else {
        await upsertConfig(payload)
      }
      message.success('保存成功')
      showModal.value = false
      await loadConfigs()
    } catch (err) {
      console.error(err)
      message.error('保存失败')
    }
  })
}

onMounted(() => {
  loadConfigs()
})
</script>

<style scoped>
.function-area {
  margin-bottom: 16px;
}
</style>

