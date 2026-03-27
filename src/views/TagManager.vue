<template>
  <n-flex vertical style="padding: 0 32px;">
    <n-flex justify="space-between" align="center" class="mb-4" style="width: 100%;">
      <n-flex align="center">
        <h2>标签管理</h2>
      </n-flex>
      <n-flex align="center" :wrap="false">
        <n-input
          v-model:value="searchKeyword"
          placeholder="搜索标签..."
          style="width: 240px"
          clearable
          @keyup.enter="handleSearch"
          @clear="handleSearch"
        />
        <n-button type="primary" @click="handleSearch">搜索</n-button>
        <n-button type="primary" @click="handleAddTag">新建标签</n-button>
      </n-flex>
    </n-flex>

    <n-data-table
      :columns="columns"
      :data="tagList"
      :loading="loading"
      :pagination="false"
      :row-key="(row: TagItem) => row.id"
      striped
    />

    <n-flex justify="flex-end" style="margin-top: 16px;">
      <n-pagination
        v-model:page="page"
        v-model:page-size="pageSize"
        :item-count="total"
        :page-sizes="[10, 20, 50, 100]"
        show-size-picker
        show-quick-jumper
        @update:page-size="() => { page = 1 }"
      />
    </n-flex>
  </n-flex>

  <!-- 添加/编辑标签弹窗 -->
  <n-modal v-model:show="showModal" :title="isEdit ? '编辑标签' : '新建标签'" preset="card" style="width: 400px;">
    <n-form :model="form" :rules="rules" ref="formRef" label-width="80">
      <n-form-item label="名称" path="name">
        <n-input v-model:value="form.name" placeholder="请输入标签名称" />
      </n-form-item>
    </n-form>
    <template #action>
      <n-space justify="end">
        <n-button @click="showModal = false">取消</n-button>
        <n-button type="primary" @click="handleSubmit">保存</n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, reactive, h, computed, onMounted } from 'vue'
import {
  NButton,
  NPopconfirm,
  NTag,
  useMessage,
  type FormInst,
  type DataTableColumns
} from 'naive-ui'
import { fetchTags as apiFetchTags, createTag, updateTag, deleteTag } from '../api/tags'

const message = useMessage()

interface TagItem {
  id: number
  name: string
  color: string
  usageCount?: number
  createdAt: string
  updatedAt: string
}

const allTags = ref<TagItem[]>([])
const loading = ref(false)
const showModal = ref(false)
const isEdit = ref(false)
const searchKeyword = ref('')
const formRef = ref<FormInst | null>(null)
const page = ref(1)
const pageSize = ref(20)

const total = computed(() => allTags.value.length)
const tagList = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return allTags.value.slice(start, start + pageSize.value)
})

const form = reactive({
  id: 0,
  name: '',
})

const rules = {
  name: [{ required: true, message: '请输入标签名称', trigger: 'blur' }]
}

const columns: DataTableColumns<TagItem> = [
  {
    title: '标签',
    key: 'name',
    render: (row) => h(NTag, {
      style: { marginRight: '4px' },
      type: 'info',
      bordered: false,
    }, { default: () => row.name })
  },
  {
    title: '使用次数',
    key: 'usageCount',
    width: 120,
    render: (row) => row.usageCount ?? 0
  },
  {
    title: '操作',
    key: 'actions',
    width: 140,
    render(row) {
      return h('div', { style: 'display: flex; gap: 8px;' }, [
        h(NButton, {
          size: 'small',
          onClick: () => handleEdit(row)
        }, { default: () => '编辑' }),
        h(NPopconfirm, {
          onPositiveClick: () => handleDelete(row.id),
          positiveText: '删除',
          negativeText: '取消'
        }, {
          default: () => '确认要删除吗？',
          trigger: () => h(NButton, {
            size: 'small',
            type: 'error'
          }, { default: () => '删除' })
        })
      ])
    }
  }
]

async function fetchTags() {
  loading.value = true
  try {
    const res = await apiFetchTags({ keyword: searchKeyword.value })
    allTags.value = Array.isArray(res) ? res : ((res as any).list ?? (res as any).records ?? [])
  } catch {
    message.error('获取标签失败')
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  page.value = 1
  fetchTags()
}

function handleAddTag() {
  isEdit.value = false
  Object.assign(form, { id: 0, name: '' })
  showModal.value = true
}

function handleEdit(row: TagItem) {
  isEdit.value = true
  Object.assign(form, row)
  showModal.value = true
}

async function handleSubmit() {
  formRef.value?.validate(async (errors) => {
    if (!errors) {
      try {
        if (isEdit.value) {
          await updateTag(form.id, form)
        } else {
          await createTag(form)
        }
        message.success('操作成功')
        showModal.value = false
        fetchTags()
      } catch {
        message.error('操作失败')
      }
    }
  })
}

async function handleDelete(id: number) {
  try {
    await deleteTag(id)
    message.success('删除成功')
    fetchTags()
  } catch {
    message.error('删除失败')
  }
}

onMounted(() => {
  fetchTags()
})
</script>
