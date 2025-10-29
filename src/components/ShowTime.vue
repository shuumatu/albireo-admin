<template>
  <div class="glass-clock-container" >
    <div class="glass-clock" :style="{ fontSize: fontSize + 'rem', padding: padding }">
      <span
        v-for="(char, idx) in displayChars"
        :key="idx"
        class="glass-char"
        :class="{ animate: animateIndices.has(idx) }"
      >
        {{ char }}
      </span>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, toRef, computed } from 'vue'

const props = defineProps({
  timeStr: {
    type: String,
    required: true
  },
  size: {       // 新增 size prop，默认 2.5rem
    type: Number,
    default: 2.5
  }
})

// 响应式 prop
const timeStr = toRef(props, 'timeStr')

// 用于显示每个字符
const displayChars = ref([])
const animateIndices = ref(new Set())

watch(
  timeStr,
  (newVal, oldVal) => {
    if (oldVal !== undefined) {
      for (let i = 0; i < newVal.length; i++) {
        if (newVal[i] !== oldVal[i]) animateIndices.value.add(i)
      }
      setTimeout(() => animateIndices.value.clear(), 300)
    }
    displayChars.value = newVal.split('')
  },
  { immediate: true }
)

onMounted(() => {
  displayChars.value = timeStr.value.split('')
})

// 计算字体大小和容器 padding
const fontSize = computed(() => props.size)
const padding = computed(() => `${props.size * 0.3}rem ${props.size * 0.6}rem`) 
</script>

<style scoped>
.glass-clock-container {
  display: flex;
  justify-content: center;
  align-items: center;
}

.glass-clock {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 6px;
  backdrop-filter: blur(10px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  display: inline-flex;
}

.glass-char {
  font-family: 'Segoe UI', Tahoma, sans-serif;
  color: #ffffff;
  letter-spacing: 0.05em;
  transition: transform 0.3s, opacity 0.3s;
  opacity: 1;
}

.glass-char.animate {
  transform: translateY(-10px);
  opacity: 0;
}
</style>
