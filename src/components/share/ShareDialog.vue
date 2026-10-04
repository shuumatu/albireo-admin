<template>
  <!--
    通用分享对话框：图片/视频/合集列表与详情都可直接挂这一个组件。
    内部状态机：form (填表单) -> creating (loading) -> result (链接+二维码)。
    失败回到 form；关闭时重置以便下次复用。

    注意模板结构：n-modal 的具名 slot (#action) 必须直接挂在 n-modal 下，
    不能被外层 <template v-if> 包裹——否则 Vue 编译器会报
    "Codegen node is missing for element/if/for node"。
    所以两个阶段的主体写在 <div v-if> 里，#action 内部再用 v-if 切换按钮组。
  -->
  <n-modal
    :show="show"
    @update:show="onUpdateShow"
    preset="card"
    :style="{ width: stage === 'result' ? '420px' : '520px' }"
    :title="dialogTitle"
    :mask-closable="stage !== 'creating'"
    :close-on-esc="stage !== 'creating'"
    :closable="stage !== 'creating'"
  >
    <!-- 阶段一：表单 + 预览（form / creating 共用一份 UI，creating 时整体 disabled） -->
    <div v-if="stage !== 'result'">
      <div v-if="target" class="share-preview">
        <img v-if="target.coverUrl" :src="target.coverUrl" :alt="target.name" class="preview-thumb" />
        <div v-else class="preview-placeholder">
          <n-icon :component="placeholderIcon" size="40" color="#999" />
        </div>
        <div class="preview-info">
          <div class="preview-title">{{ target.name }}</div>
          <n-tag :type="targetTagType" size="small" :bordered="false">
            {{ formatTargetType(target.targetType) }}
          </n-tag>
        </div>
      </div>
      <n-divider style="margin: 12px 0;" />
      <n-form :model="form" label-placement="top" :disabled="stage === 'creating'">
        <n-form-item label="自定义标题">
          <n-input v-model:value="form.title" placeholder="留空使用原资源标题" maxlength="80" show-count />
        </n-form-item>
        <n-form-item label="描述">
          <n-input v-model:value="form.description" type="textarea" placeholder="可选描述" :rows="2" maxlength="200" show-count />
        </n-form-item>
        <n-form-item label="访问密码">
          <n-input v-model:value="form.password" type="password" show-password-on="click" placeholder="留空则无密码保护" />
        </n-form-item>
        <n-form-item label="过期时间">
          <n-date-picker v-model:value="expireTs" type="datetime" clearable style="width: 100%" />
        </n-form-item>
        <n-form-item label="最大访问次数">
          <n-input-number v-model:value="form.maxViews" placeholder="留空不限制" style="width: 100%" :min="1" :precision="0" :show-button="false" />
        </n-form-item>
      </n-form>
    </div>

    <!-- 阶段二：链接 / 二维码 -->
    <div v-else-if="createdShare" class="result-container">
      <n-result status="success" title="分享创建成功" size="small" style="margin-bottom: 8px;" />
      <img :src="qrUrl" alt="分享二维码" class="qr-image" />
      <n-input :value="createdShare.shareUrl" readonly class="share-url-input">
        <template #suffix>
          <n-button text @click="copyUrl(createdShare!.shareUrl)" title="复制链接">
            <template #icon><n-icon :component="CopyOutline" /></template>
          </n-button>
        </template>
      </n-input>
      <n-text depth="3" style="font-size: 12px; text-align: center;">
        扫描二维码或复制链接分享给他人
      </n-text>
    </div>

    <!-- 底部按钮区：用 v-if 在 slot 内部切换，避免破坏具名 slot 结构 -->
    <template #action>
      <n-space v-if="stage !== 'result'">
        <n-button @click="close" :disabled="stage === 'creating'">取消</n-button>
        <n-button type="primary" @click="handleCreate" :loading="stage === 'creating'">
          创建分享
        </n-button>
      </n-space>
      <n-space v-else justify="end">
        <n-button @click="close">完成</n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  NModal, NForm, NFormItem, NInput, NInputNumber, NDatePicker,
  NButton, NSpace, NIcon, NTag, NDivider, NResult, NText,
  useMessage
} from 'naive-ui'
import {
  CopyOutline, VideocamOutline, ImageOutline, AlbumsOutline
} from '@vicons/ionicons5'
import {
  createShare,
  getShareQRCodeUrl,
  type ShareTargetType,
  type ShareCreateDTO,
  type ShareVO
} from '../../api/share'

interface ShareTarget {
  targetType: ShareTargetType
  targetId: number
  name: string
  coverUrl?: string | null
}

const props = defineProps<{
  show: boolean
  target: ShareTarget | null
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
  'created': [share: ShareVO]
}>()

const message = useMessage()

type Stage = 'form' | 'creating' | 'result'
const stage = ref<Stage>('form')
const createdShare = ref<ShareVO | null>(null)

const form = ref({
  title: '',
  description: '',
  password: '',
  maxViews: null as number | null
})
const expireTs = ref<number | null>(null)

const dialogTitle = computed(() => {
  if (stage.value === 'result') return '分享链接'
  if (!props.target) return '创建分享'
  return `分享${formatTargetType(props.target.targetType)}`
})

const placeholderIcon = computed(() => {
  if (!props.target) return ImageOutline
  return props.target.targetType === 'video' ? VideocamOutline
    : props.target.targetType === 'image' ? ImageOutline
    : AlbumsOutline
})

const targetTagType = computed<'info' | 'success' | 'warning'>(() => {
  if (!props.target) return 'info'
  return props.target.targetType === 'video' ? 'info'
    : props.target.targetType === 'image' ? 'success'
    : 'warning'
})

const qrUrl = computed(() => {
  if (!createdShare.value) return ''
  return getShareQRCodeUrl(createdShare.value.shareCode)
})

function formatTargetType(type: ShareTargetType): string {
  return type === 'video' ? '视频' : type === 'image' ? '图片' : '合集'
}

function resetForm() {
  form.value = { title: '', description: '', password: '', maxViews: null }
  expireTs.value = null
}

function reset() {
  resetForm()
  createdShare.value = null
  stage.value = 'form'
}

function close() {
  if (stage.value === 'creating') return
  emit('update:show', false)
}

function onUpdateShow(value: boolean) {
  if (!value && stage.value === 'creating') return
  emit('update:show', value)
}

watch(() => props.show, (val) => {
  if (val) {
    reset()
  }
})

async function handleCreate() {
  if (stage.value !== 'form') return
  if (!props.target) {
    message.error('未指定分享对象')
    return
  }
  const payload: ShareCreateDTO = {
    targetType: props.target.targetType,
    targetId: props.target.targetId
  }
  if (form.value.title.trim()) payload.title = form.value.title.trim()
  if (form.value.description.trim()) payload.description = form.value.description.trim()
  if (form.value.password) payload.password = form.value.password
  if (expireTs.value) {
    if (expireTs.value <= Date.now()) {
      message.warning('过期时间需晚于当前时间')
      return
    }
    payload.expiresAt = new Date(expireTs.value).toISOString()
  }
  if (form.value.maxViews !== null) {
    if (!Number.isSafeInteger(form.value.maxViews) || form.value.maxViews < 1) { message.warning('最大访问次数必须是正整数'); return }
    payload.maxViews = form.value.maxViews
  }

  stage.value = 'creating'
  try {
    const result = await createShare(payload)
    createdShare.value = result
    stage.value = 'result'
    emit('created', result)
    message.success('分享创建成功')
  } catch (e: any) {
    stage.value = 'form'
    message.error(e?.response?.data?.message || '创建分享失败')
  }
}

/**
 * 复制到剪贴板。优先 Clipboard API（HTTPS / localhost），否则降级到
 * document.execCommand('copy')。两者都失败时给出兜底提示让用户手动复制。
 */
async function copyUrl(url: string) {
  if (!url) return
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(url)
      message.success('链接已复制')
      return
    } catch {
      // 兜底逻辑
    }
  }
  try {
    const textarea = document.createElement('textarea')
    textarea.value = url
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    if (ok) {
      message.success('链接已复制')
    } else {
      message.warning('复制失败，请手动复制链接')
    }
  } catch {
    message.warning('复制失败，请手动复制链接')
  }
}
</script>

<style scoped>
.share-preview {
  display: flex;
  align-items: center;
  gap: 14px;
}

.preview-thumb {
  width: 100px;
  height: 64px;
  object-fit: cover;
  border-radius: 6px;
  flex-shrink: 0;
}

.preview-placeholder {
  width: 100px;
  height: 64px;
  border-radius: 6px;
  background-color: var(--n-color-target, #f5f5f5);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.preview-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.preview-title {
  font-size: 15px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}

.qr-image {
  width: 240px;
  height: 240px;
  border: 1px solid var(--n-border-color, #e0e0e6);
  border-radius: 8px;
  background: #fff;
}

.share-url-input {
  width: 100%;
}
</style>
