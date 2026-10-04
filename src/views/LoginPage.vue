<template>
  <div class="login-container">
    <div class="login-card">
      <div class="login-header">
        <img
          :src="albireoLogo"
          alt="Albireo 狐狸"
          class="login-logo"
        />
        <h1 class="login-title">管理后台</h1>
        <p class="login-subtitle">管理员登录</p>
      </div>

      <n-form ref="formRef" :model="formData" :rules="rules" @keyup.enter="handleLogin">
        <n-form-item path="username" label="用户名">
          <n-input
            v-model:value="formData.username"
            placeholder="请输入用户名"
            size="large"
            :input-props="{ autocomplete: 'username' }"
          >
            <template #prefix>
              <n-icon :component="PersonIcon" />
            </template>
          </n-input>
        </n-form-item>

        <n-form-item path="password" label="密码">
          <n-input
            v-model:value="formData.password"
            type="password"
            show-password-on="click"
            placeholder="请输入密码"
            size="large"
            :input-props="{ autocomplete: 'current-password' }"
          >
            <template #prefix>
              <n-icon :component="LockIcon" />
            </template>
          </n-input>
        </n-form-item>

        <div class="remember-row">
          <n-checkbox v-model:checked="rememberMe">记住密码</n-checkbox>
        </div>

        <n-button
          type="primary"
          block
          strong
          size="large"
          :loading="loading"
          @click="handleLogin"
          class="login-btn"
        >
          登 录
        </n-button>
      </n-form>
    </div>
  </div>
</template>

<script setup lang="ts">
const albireoLogo = `${import.meta.env.BASE_URL}albireo-favicon.svg`
import { ref, reactive, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMessage, type FormInst, type FormRules } from 'naive-ui'
import { PersonOutline as PersonIcon, LockClosedOutline as LockIcon } from '@vicons/ionicons5'
import { adminLogin } from '../api/auth'
import { useAuthStore } from '../stores/auth'
import { saveCredential, loadCredential, clearCredential } from '../utils/credentialCrypto'

const router = useRouter()
const route = useRoute()
const message = useMessage()
const authStore = useAuthStore()
const formRef = ref<FormInst | null>(null)
const loading = ref(false)
const rememberMe = ref(false)

const formData = reactive({
  username: '',
  password: ''
})

onMounted(async () => {
  try {
    const saved = await loadCredential()
    if (saved) {
      formData.username = saved.username
      formData.password = saved.password
      rememberMe.value = true
    }
  } catch { clearCredential() }
})

const rules: FormRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' }
  ]
}

async function handleLogin() {
  if (loading.value) return
  loading.value = true
  try {
    formData.username = formData.username.trim()
    await formRef.value?.validate()
  } catch {
    loading.value = false
    return
  }

  loading.value = true
  try {
    const { data } = await adminLogin(formData.username, formData.password)
    authStore.setLoginInfo(data)
    try {
      if (rememberMe.value) await saveCredential(formData.username, formData.password)
      else clearCredential()
    } catch { message.warning('已登录，但无法保存本机登录信息') }
    message.success('登录成功')
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    router.replace(redirect.startsWith('/') && !redirect.startsWith('//') && !redirect.startsWith('/login') ? redirect : '/')
  } catch (err: any) {
    const status = err.response?.status
    const msg = err.response?.data
    if (status === 400) {
      message.error(typeof msg === 'string' ? msg : '用户名或密码错误')
    } else if (status === 403) {
      message.error(typeof msg === 'string' ? msg : '无管理员权限')
    } else {
      message.error('登录失败，请稍后重试')
    }
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-container {
  padding: 24px 16px;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(ellipse at 18% 16%, #dcefd8 0%, transparent 50%), linear-gradient(135deg, #f5faf2 0%, #eaf5e8 55%, #d6ead3 100%);
}

.login-card {
  width: min(440px, 100%);
  padding: 48px 40px;
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(20px);
  border-radius: 16px;
  border: 1px solid #d9e9d8;
  box-shadow: 0 16px 50px rgba(49, 90, 56, 0.09);
}

.login-header {
  text-align: center;
  margin-bottom: 36px;
}

.login-logo {
  width: 76px;
  height: 76px;
  margin-bottom: 16px;
}

.login-title {
  font-size: 24px;
  font-weight: 600;
  color: var(--admin-text);
  margin: 0 0 8px 0;
  letter-spacing: 1px;
}

.login-subtitle {
  font-size: 14px;
  color: var(--admin-muted);
  margin: 0;
}

.login-btn {
  margin-top: 12px;
  height: 44px;
  font-size: 16px;
  letter-spacing: 4px;
}

:deep(.n-form-item-label) {
  color: var(--n-text-color-2);
}
.login-card :deep(.n-input__prefix .n-icon) { color: var(--admin-icon); }

.remember-row {
  margin-bottom: 4px;
}
@media (max-width: 480px) { .login-card { padding: 32px 24px; } }
</style>
