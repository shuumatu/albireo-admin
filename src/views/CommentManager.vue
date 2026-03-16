<template>
  <div class="p-8">
    <n-card title="评论管理" class="max-w-5xl mx-auto">
      <div class="function-area">
        <n-flex align="center">
          <n-select
            v-model:value="targetType"
            :options="targetTypeOptions"
            placeholder="选择类型"
            style="width: 140px"
          />
          <n-input
            v-model:value="targetId"
            placeholder="输入媒体 UUID"
            style="width: 360px"
            clearable
          />
          <n-button type="primary" @click="handleQuery" :disabled="!targetType || !targetId">
            查询
          </n-button>
        </n-flex>
      </div>

      <n-alert v-if="commentCount !== null" type="info" :bordered="false" class="count-bar">
        共 <strong>{{ commentCount }}</strong> 条评论
      </n-alert>

      <n-spin :show="loading">
        <n-empty v-if="queried && !loading && comments.length === 0" description="暂无评论" />

        <div v-if="comments.length > 0" class="comment-list">
          <div v-for="comment in comments" :key="comment.id" class="comment-item">
            <div class="comment-main">
              <div class="comment-header">
                <span class="comment-user">{{ comment.username }}</span>
                <span class="comment-time">{{ formatTime(comment.createdAt) }}</span>
              </div>
              <div class="comment-content">{{ comment.content }}</div>
              <div class="comment-actions">
                <n-popconfirm
                  @positive-click="handleDelete(comment.id)"
                  positive-text="删除"
                  negative-text="取消"
                >
                  <template #trigger>
                    <n-button size="tiny" type="error" quaternary>删除</n-button>
                  </template>
                  确认要删除这条评论吗？删除后其回复也会被一并删除。
                </n-popconfirm>
              </div>
            </div>

            <div v-if="comment.replies && comment.replies.length > 0" class="reply-list">
              <div v-for="reply in comment.replies" :key="reply.id" class="reply-item">
                <div class="comment-header">
                  <span class="comment-user">{{ reply.username }}</span>
                  <span class="comment-time">{{ formatTime(reply.createdAt) }}</span>
                </div>
                <div class="comment-content">{{ reply.content }}</div>
                <div class="comment-actions">
                  <n-popconfirm
                    @positive-click="handleDelete(reply.id)"
                    positive-text="删除"
                    negative-text="取消"
                  >
                    <template #trigger>
                      <n-button size="tiny" type="error" quaternary>删除</n-button>
                    </template>
                    确认要删除这条回复吗？
                  </n-popconfirm>
                </div>
              </div>
            </div>
          </div>
        </div>
      </n-spin>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useMessage } from 'naive-ui'
import {
  getComments,
  getCommentCount,
  deleteComment,
  type CommentVO,
  type CommentTargetType
} from '../api/comment'

const route = useRoute()
const message = useMessage()

const targetType = ref<CommentTargetType | null>(null)
const targetId = ref('')
const comments = ref<CommentVO[]>([])
const commentCount = ref<number | null>(null)
const loading = ref(false)
const queried = ref(false)

const targetTypeOptions = [
  { label: '视频', value: 'video' },
  { label: '图片', value: 'image' }
]

function formatTime(time: string | null) {
  if (!time) return '-'
  return new Date(time).toLocaleString('zh-CN')
}

async function handleQuery() {
  if (!targetType.value || !targetId.value.trim()) {
    message.warning('请选择目标类型并输入媒体 UUID')
    return
  }

  loading.value = true
  queried.value = true

  try {
    const [list, count] = await Promise.all([
      getComments(targetType.value, targetId.value.trim()),
      getCommentCount(targetType.value, targetId.value.trim())
    ])
    comments.value = list
    commentCount.value = count
  } catch {
    message.error('获取评论失败')
    comments.value = []
    commentCount.value = null
  } finally {
    loading.value = false
  }
}

async function handleDelete(id: number) {
  try {
    await deleteComment(id)
    message.success('删除成功')
    handleQuery()
  } catch {
    message.error('删除失败')
  }
}

onMounted(() => {
  const queryType = route.query.targetType as string | undefined
  const queryId = route.query.targetId as string | undefined

  if (queryType && (queryType === 'video' || queryType === 'image')) {
    targetType.value = queryType
  }
  if (queryId) {
    targetId.value = queryId
  }
  if (targetType.value && targetId.value) {
    handleQuery()
  }
})
</script>

<style scoped>
.function-area {
  margin-bottom: 16px;
}

.count-bar {
  margin-bottom: 16px;
}

.comment-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.comment-item {
  border: 1px solid var(--n-border-color, #e0e0e6);
  border-radius: 6px;
  padding: 12px 16px;
}

.comment-main {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.comment-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.comment-user {
  font-weight: 600;
  font-size: 14px;
}

.comment-time {
  color: #999;
  font-size: 12px;
}

.comment-content {
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.comment-actions {
  display: flex;
  justify-content: flex-end;
}

.reply-list {
  margin-top: 8px;
  margin-left: 24px;
  padding-left: 12px;
  border-left: 2px solid var(--n-border-color, #e0e0e6);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.reply-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 0;
}
</style>
