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
            :options="visibilityOptions"
            trigger="click"
            @update:value="(v: string) => $emit('change-visibility', v)"
          >
            <n-button size="small">
              <template #icon>
                <svg viewBox="0 0 24 24" width="14" height="14">
                  <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" fill="currentColor" />
                </svg>
              </template>
              改可见性
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
                删除
              </n-button>
            </template>
            确定删除已选 {{ selectedCount }} 个视频？此操作不可恢复。
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
}>()

defineEmits<{
  (e: 'add-to-collections', collectionIds: number[]): void
  (e: 'change-visibility', visibility: string): void
  (e: 'delete'): void
  (e: 'clear'): void
}>()

const collectionOptions = computed(() =>
  props.collections.map((c) => ({ label: c.name, value: c.id }))
)

const visibilityOptions = [
  { label: '公开', value: 'public' },
  { label: '好友可见', value: 'friends' },
  { label: '私密', value: 'private' },
]
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
/* 主色小圆点，作为"有选中"的视觉锚点 */
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
