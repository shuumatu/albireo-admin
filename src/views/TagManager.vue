<template>
  <div class="p-8">
    <n-card title="标签管理" class="max-w-5xl mx-auto">
      <div class="function-area">
        <n-flex align="center">
          <n-input 
            v-model:value="searchKeyword" 
            placeholder="搜索标签..." 
            style="width: 240px" 
            clearable 
          />
          <n-button type="primary" @click="fetchTags">搜索</n-button>
          <n-button type="primary" @click="handleAddTag">新建标签</n-button>
        </n-flex>
      </div>

      <n-data-table
        :columns="columns"
        :data="tagList"
        :loading="loading"
        :pagination="pagination"
      />
    </n-card>

    <!-- 添加/编辑标签弹窗 -->
    <n-modal v-model:show="showModal" :title="isEdit ? '编辑标签' : '新建标签'" preset="card" style="width: 40vw;">
      <n-form :model="form" :rules="rules" ref="formRef" label-width="80">
        <n-form-item label="名称" path="name">
          <n-input v-model:value="form.name" placeholder="请输入标签名称" />
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
import { ref, reactive, h, computed, onMounted } from 'vue'
import { 
  NButton, 
  NPopconfirm,
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

const tagList = ref<TagItem[]>([])
const loading = ref(false)
const showModal = ref(false)
const isEdit = ref(false)
const searchKeyword = ref('')
const formRef = ref<FormInst | null>(null)

const form = reactive({
  id: 0,
  name: '',
})

const pagination = computed(() => ({
  page: 1,
  pageSize: 20,
  itemCount: tagList.value?.length ?? 0,
  showSizePicker: true,
  pageSizes: [10, 20, 50, 100]
}))

const rules = {
  name: [{ required: true, message: '请输入标签名称', trigger: 'blur' }]
}

const columns: DataTableColumns<TagItem> = [
  {
    title: '标签',
    key: 'tag',
    render: (row) => h('div', [
      h('n-tag', {
        color: { color: row.color || '#18a058'}
      }, { default: () => row.name })
    ])
  },
  { title: '使用次数', key: 'usageCount', render: (row) => row.usageCount || 0 },
  {
    title: '操作',
    key: 'actions',
    render(row) {
      return [
        h(NButton, {
          size: 'small',
          style: { marginRight: '8px' },
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
      ]
    }
  }
]

async function fetchTags() {
  loading.value = true
  try {
    const res = await apiFetchTags({ keyword: searchKeyword.value })
    tagList.value = res
  } catch (err) {
    message.error('获取标签失败')
  } finally {
    loading.value = false
  }
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
      } catch (err) {
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
  } catch (err) {
    message.error('删除失败')
  }
}

onMounted(() => {
  fetchTags()
})
</script>

<style scoped>
.function-area {
  margin-bottom: 16px;
}
</style>