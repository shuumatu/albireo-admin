<template>
  <section class="admin-page comments-page">
    <header class="admin-page-header"><div><h1>评论管理</h1><p>按媒体查询评论，集中查看讨论与回复。</p></div></header>
    <div class="admin-panel">
      <div class="admin-toolbar comment-toolbar">
        <n-select v-model:value="targetType" :options="targetTypeOptions" placeholder="媒体类型" class="type-select" aria-label="媒体类型" />
        <n-input v-model:value="targetId" placeholder="输入媒体 UUID" clearable class="target-input" aria-label="媒体 UUID" @keyup.enter="handleQuery" />
        <n-button type="primary" :loading="loading" :disabled="!targetId.trim()" @click="handleQuery">查询评论</n-button>
        <n-button v-if="queried" :disabled="loading" @click="resetQuery">重置</n-button>
      </div>
      <p class="query-hint">可从图片或视频管理中的评论入口进入，自动填入对应媒体。</p>
      <n-alert v-if="loadError" type="error" :bordered="false" class="count-bar">{{ loadError }} <n-button text type="error" @click="handleQuery">重新查询</n-button></n-alert>
      <div v-if="commentCount !== null" class="result-header" aria-live="polite">
        <div><strong>{{ commentCount }}</strong> 条评论 <n-text depth="3">（含回复）</n-text></div>
        <n-tag :bordered="false" size="small">{{ activeTarget?.type === 'image' ? '图片' : '视频' }} · {{ activeTarget?.id }}</n-tag>
      </div>
      <n-spin :show="loading">
        <div class="comment-results">
          <n-empty v-if="!loading && !loadError && comments.length === 0" :description="queried ? '该媒体还没有评论' : '选择媒体类型并输入 UUID，开始查看评论'" class="empty-state" />
          <div v-if="comments.length > 0" class="comment-list">
            <article v-for="comment in comments" :key="comment.id" class="comment-item">
              <div class="comment-main">
                <div class="comment-header"><span class="comment-avatar" aria-hidden="true">{{ (comment.username || '用').slice(0, 1) }}</span><span class="comment-user">{{ comment.username || '未命名用户' }}</span><time class="comment-time">{{ formatTime(comment.createdAt) }}</time></div>
                <div class="comment-content">{{ comment.content }}</div>
                <div class="comment-actions">
                  <n-button v-if="comment.replies?.length" size="small" text type="primary" @click="toggleReplies(comment.id)">{{ collapsedReplies.has(comment.id) ? '展开' : '收起' }} {{ comment.replies.length }} 条回复</n-button>
                  <n-popconfirm @positive-click="handleDelete(comment.id)" positive-text="删除评论" negative-text="取消"><template #trigger><n-button size="small" type="error" quaternary :loading="deletingIds.has(comment.id)" :disabled="loading">删除</n-button></template>确认删除这条评论及其全部回复？</n-popconfirm>
                </div>
              </div>
              <div v-if="comment.replies?.length && !collapsedReplies.has(comment.id)" class="reply-list">
                <div v-for="reply in comment.replies" :key="reply.id" class="reply-item">
                  <div class="comment-header"><span class="comment-user">{{ reply.username || '未命名用户' }}</span><time class="comment-time">{{ formatTime(reply.createdAt) }}</time></div>
                  <div class="comment-content">{{ reply.content }}</div>
                  <div class="comment-actions"><n-popconfirm @positive-click="handleDelete(reply.id)" positive-text="删除回复" negative-text="取消"><template #trigger><n-button size="small" type="error" quaternary :loading="deletingIds.has(reply.id)" :disabled="loading">删除回复</n-button></template>确认删除这条回复？</n-popconfirm></div>
                </div>
              </div>
            </article>
          </div>
        </div>
      </n-spin>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useMessage } from 'naive-ui'
import { getComments, getCommentCount, deleteComment, type CommentVO, type CommentTargetType } from '../api/comment'
const route = useRoute()
const message = useMessage()
const targetType = ref<CommentTargetType>('video')
const targetId = ref('')
const activeTarget = ref<{ type: CommentTargetType; id: string } | null>(null)
const comments = ref<CommentVO[]>([])
const commentCount = ref<number | null>(null)
const loading = ref(false)
const queried = ref(false)
const loadError = ref('')
const deletingIds = ref(new Set<number>())
const collapsedReplies = ref(new Set<number>())
let requestId = 0
const targetTypeOptions = [{ label: '视频', value: 'video' }, { label: '图片', value: 'image' }]
function formatTime(time: string | null) { if (!time) return '时间未知'; const date = new Date(time); return Number.isNaN(date.getTime()) ? '时间未知' : date.toLocaleString('zh-CN') }
function toggleReplies(id: number) { if (collapsedReplies.value.has(id)) collapsedReplies.value.delete(id); else collapsedReplies.value.add(id) }
function resetQuery() {
  requestId++; targetId.value = ''; comments.value = []; commentCount.value = null
  activeTarget.value = null; queried.value = false; loadError.value = ''; loading.value = false; collapsedReplies.value.clear()
}
function handleQuery() {
  if (!targetId.value.trim()) { message.warning('请输入媒体 UUID'); return }
  void fetchComments({ type: targetType.value, id: targetId.value.trim() })
}
async function fetchComments(target: { type: CommentTargetType; id: string }) {
  const current = ++requestId
  activeTarget.value = target; loading.value = true; queried.value = true; loadError.value = ''
  comments.value = []; commentCount.value = null
  try {
    const [list, count] = await Promise.all([getComments(target.type, target.id), getCommentCount(target.type, target.id)])
    if (current !== requestId) return
    comments.value = list; commentCount.value = count
  } catch {
    if (current === requestId) loadError.value = '评论加载失败，请检查媒体 UUID 或稍后重试。'
  } finally { if (current === requestId) loading.value = false }
}
async function handleDelete(id: number) {
  if (deletingIds.value.has(id)) return false
  const target = activeTarget.value
  deletingIds.value.add(id)
  try {
    await deleteComment(id); message.success('评论已删除')
    if (target && target === activeTarget.value) await fetchComments(target)
  } catch { message.error('删除失败，请重试'); return false }
  finally { deletingIds.value.delete(id) }
}
watch(() => [route.query.targetType, route.query.targetId], ([queryType, queryId]) => {
  if (queryType === 'video' || queryType === 'image') targetType.value = queryType
  if (typeof queryId === 'string' && queryId.trim()) { targetId.value = queryId; handleQuery() }
}, { immediate: true })
</script>

<style scoped>
.comment-toolbar { gap: 10px; flex-wrap: wrap; }
.type-select { width: 140px; }.target-input { width: min(380px, 100%); }
.query-hint { color: var(--admin-text-muted, #75819a); margin: 0 0 24px; font-size: 13px; }
.count-bar { margin-bottom: 16px; }.result-header { display: flex; gap: 12px; flex-wrap: wrap; justify-content: space-between; margin-bottom: 20px; }.result-header strong { font-size: 24px; color: var(--admin-accent, #2f7b5b); }.result-header :deep(.n-tag) { max-width: 100%; height: auto; white-space: normal; overflow-wrap: anywhere; }
.comment-results { min-height: 180px; }.empty-state { padding: 48px 12px; }.comment-list { display: grid; gap: 16px; }
.comment-item { border: 1px solid var(--n-border-color, #e0e9e1); border-radius: 14px; padding: 20px; animation: comment-in .22s ease both; }
.comment-header { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }.comment-avatar { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 10px; background: var(--admin-accent-soft, #e6f3e9); color: var(--admin-accent, #2f7b5b); font-weight: 600; }.comment-user { font-weight: 600; }.comment-time { color: var(--admin-text-muted, #75819a); font-size: 12px; margin-left: auto; }.comment-content { margin-top: 10px; line-height: 1.8; white-space: pre-wrap; overflow-wrap: anywhere; }.comment-actions { display: flex; align-items: center; justify-content: flex-end; gap: 16px; margin-top: 6px; }.reply-list { margin-top: 12px; margin-left: 16px; padding-left: 16px; border-left: 2px solid var(--admin-border, #e0e9e1); }.reply-item { background: var(--admin-bg, #f5f9f5); padding: 12px 16px; border-radius: 10px; margin-top: 10px; }
@keyframes comment-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
@media (max-width: 640px) { .target-input { width: 100%; }.comment-item { padding: 14px; }.comment-time { width: 100%; margin-left: 0; }.reply-list { margin-left: 0; padding-left: 10px; } }
@media (prefers-reduced-motion: reduce) { .comment-item { animation: none; } }
</style>
