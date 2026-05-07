<template>
  <Transition name="float-bar">
    <div v-if="selectedCount > 0" class="floating-bar">
      <div class="floating-bar__inner">
        <div class="floating-bar__count">
          <span class="count-dot" aria-hidden="true"></span>
          <span class="count-num">已选 {{ selectedCount }} 项</span>
          <span v-if="crossPageCount > 0" class="count-cross">含跨页 {{ crossPageCount }}</span>
        </div>

        <div class="floating-bar__actions">
          <n-popselect
            :options="collectionOptions"
            multiple
            trigger="click"
            scrollable
            :show-checkmark="true"
            @update:value="(v: number[]) => $emit('add-to-collections', v)"
          >
            <n-button size="small">
              <template #icon>
                <svg viewBox="0 0 24 24" width="14" height="14">
                  <path d="M3 3h7v7H3V3m11 0h7v7h-7V3m-11 11h7v7H3v-7m11 0h7v7h-7v-7" fill="currentColor" />
                </svg>
              </template>
              加入合集
            </n-button>
          </n-popselect>

          <n-popselect
            :options="typeOptions"
            trigger="click"
            @update:value="(v: string) => $emit('change-type', v)"
          >
            <n-button size="small">
              <template #icon>
                <svg viewBox="0 0 24 24" width="14" height="14">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4h2v4h14v-4h2M17.5 11.5L13 7v3H4v3h9v3l4.5-4.5z" fill="currentColor"/>
                </svg>
              </template>
              改类型
            </n-button>
          </n-popselect>

          <n-popconfirm
            placement="top"
            @positive-click="$emit('delete')"
          >
            <template #trigger>
              <n-button size="small" type="error">
                <template #icon>
                  <svg viewBox="0 0 24 24" width="14" height="14">
                    <path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12M19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="currentColor" />
                  </svg>
                </template>
                {{ deleteLabel }}
              </n-button>
            </template>
            {{ deletePromptText }}
          </n-popconfirm>

          <n-button size="small" quaternary @click="$emit('clear')" title="清空选择 (Esc)">
            清空
          </n-button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { NButton, NPopconfirm, NPopselect } from 'naive-ui'

const props = defineProps<{
  selectedCount: number
  crossPageCount: number
  collections: { id: number; name: string }[]
  /**
   * 合集详情场景：当前列表是某合集内的图片。"删除"语义自动改为"从合集中移除"
   * （不会真删图片）。父组件根据 collectionDetailStore.img 决定。
   */
  isInCollectionView?: boolean
}>()

defineEmits<{
  (e: 'add-to-collections', collectionIds: number[]): void
  (e: 'change-type', type: string): void
  (e: 'delete'): void
  (e: 'clear'): void
}>()

const collectionOptions = computed(() =>
  props.collections.map((c) => ({ label: c.name, value: c.id }))
)

const typeOptions = [
  { label: '照片', value: 'photo' },
  { label: '封面', value: 'cover' },
  { label: '其他', value: 'other' },
]

const deleteLabel = computed(() => (props.isInCollectionView ? '从合集移除' : '删除'))
const deletePromptText = computed(() =>
  props.isInCollectionView
    ? `确定从当前合集中移除已选 ${props.selectedCount} 张图片？图片本身不会被删除。`
    : `确定删除已选 ${props.selectedCount} 张图片？此操作不可恢复。`
)
</script>

<style scoped>
.floating-bar {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  z-index: 50;
  pointer-events: none;
}
.floating-bar__inner {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 14px 10px 18px;
  border-radius: 14px;
  background: var(--n-card-color);
  /* 双层阴影：近距离淡阴影 + 远距离弥漫阴影，浅色主题下也能"飘起来" */
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.06),
    0 4px 12px rgba(0, 0, 0, 0.06),
    0 24px 60px -16px rgba(0, 0, 0, 0.22);
  min-width: 480px;
}
.floating-bar__count {
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1 1 auto;
  color: var(--n-text-color);
}
.count-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--n-primary-color);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--n-primary-color) 22%, transparent);
  flex: 0 0 auto;
}
.count-num {
  font-weight: 600;
}
.count-cross {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--n-primary-color) 12%, transparent);
  color: color-mix(in srgb, var(--n-primary-color) 80%, var(--n-text-color));
}
.floating-bar__actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
}

.float-bar-enter-active,
.float-bar-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}
.float-bar-enter-from,
.float-bar-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(16px);
}
</style>
