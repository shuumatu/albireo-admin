<template>
  <n-config-provider :theme="darkTheme">
  <div class="login-container">
    <div class="login-card">
      <div class="login-header">
        <img
          src="https://albireo.shuumatu.com/uploads/0e84dd80119bbfc52609e5e4fda0b57.png"
          alt="Logo"
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
            :input-props="{ autocomplete: 'off' }"
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
  </n-config-provider>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { darkTheme, useMessage, type FormInst, type FormRules } from 'naive-ui'
import { PersonOutline as PersonIcon, LockClosedOutline as LockIcon } from '@vicons/ionicons5'
import { adminLogin } from '../api/auth'
import { useAuthStore } from '../stores/auth'
import { saveCredential, loadCredential, clearCredential } from '../utils/credentialCrypto'

const router = useRouter()
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
  const saved = await loadCredential()
  if (saved) {
    formData.username = saved.username
    formData.password = saved.password
    rememberMe.value = true
  }
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
  try {
    await formRef.value?.validate()
  } catch {
    return
  }

  loading.value = true
  try {
    const { data } = await adminLogin(formData.username, formData.password)
    authStore.setLoginInfo(data)
    if (rememberMe.value) {
      await saveCredential(formData.username, formData.password)
    } else {
      clearCredential()
    }
    message.success('登录成功')
    router.push('/')
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
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%);
}

.login-card {
  width: 400px;
  padding: 48px 40px;
  background: rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(20px);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.login-header {
  text-align: center;
  margin-bottom: 36px;
}

.login-logo {
  height: 56px;
  margin-bottom: 16px;
}

.login-title {
  font-size: 24px;
  font-weight: 600;
  color: #fff;
  margin: 0 0 8px 0;
  letter-spacing: 1px;
}

.login-subtitle {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.5);
  margin: 0;
}

.login-btn {
  margin-top: 12px;
  height: 44px;
  font-size: 16px;
  letter-spacing: 4px;
}

:deep(.n-form-item-label) {
  color: rgba(255, 255, 255, 0.7) !important;
}

.remember-row {
  margin-bottom: 4px;
}
</style>
