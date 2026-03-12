import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(null)
  const userId = ref<number | null>(null)
  const username = ref<string | null>(null)
  const role = ref<string | null>(null)

  const isLoggedIn = computed(() => !!token.value)

  function setLoginInfo(data: {
    token: string
    userId: number
    username: string
    role: string
  }) {
    token.value = data.token
    userId.value = data.userId
    username.value = data.username
    role.value = data.role
    localStorage.setItem('token', data.token)
  }

  function logout() {
    token.value = null
    userId.value = null
    username.value = null
    role.value = null
    localStorage.removeItem('token')
  }

  return { token, userId, username, role, isLoggedIn, setLoginInfo, logout }
}, {
  persist: true
})
