<template>
  <div class="page">
    <div class="login-header">
      <h2>TokenManager</h2>
      <p>欢迎回来</p>
    </div>

    <van-form @submit="onLogin">
      <van-cell-group inset>
        <van-field
          v-model="email"
          name="email"
          label="邮箱"
          placeholder="请输入邮箱"
          :rules="[{ required: true, message: '请输入邮箱' }, { pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: '邮箱格式不正确' }]"
        >
          <template #button>
            <van-button
              size="small"
              type="primary"
              :disabled="!canSendCode"
              :loading="sendingCode"
              @click="onSendCode"
            >
              {{ sendCodeText }}
            </van-button>
          </template>
        </van-field>
        <van-field
          v-model="code"
          type="text"
          name="code"
          label="验证码"
          placeholder="请输入6位验证码"
          maxlength="6"
          :rules="[{ required: true, message: '请输入验证码' }, { pattern: /^\d{6}$/, message: '请输入6位数字验证码' }]"
        />
      </van-cell-group>
      <div style="margin: 16px;">
        <van-button round block type="primary" native-type="submit" :loading="loading">
          登录
        </van-button>
      </div>
    </van-form>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import api, { logAction } from '../utils/api.js'

const router = useRouter()
const email = ref('')
const code = ref('')
const loading = ref(false)
const sendingCode = ref(false)
const countdown = ref(0)

const canSendCode = computed(() => {
  return countdown.value <= 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)
})

const sendCodeText = computed(() => {
  if (sendingCode.value) return '发送中...'
  if (countdown.value > 0) return `${countdown.value}s`
  return '获取验证码'
})

let timer = null

async function onSendCode() {
  if (!canSendCode.value) return
  sendingCode.value = true
  try {
    const res = await api.post('/auth/send-code', { email: email.value })
    showToast(res.message || '验证码已发送')
    countdown.value = 60
    timer = setInterval(() => {
      countdown.value--
      if (countdown.value <= 0) {
        clearInterval(timer)
        timer = null
      }
    }, 1000)
  } catch (e) {
    showToast(e.response?.data?.detail || '发送失败')
  } finally {
    sendingCode.value = false
  }
}

async function onLogin() {
  loading.value = true
  try {
    const res = await api.post('/auth/code-login', { email: email.value, code: code.value })
    localStorage.setItem('token', res.access_token)
    localStorage.setItem('user', JSON.stringify(res.user))
    logAction('login', '/login', `用户登录成功: ${email.value}`)
    showToast('登录成功')
    router.push('/home')
  } catch (e) {
    logAction('login_failed', '/login', `登录失败: ${email.value} - ${e.response?.data?.detail || '未知错误'}`)
    showToast(e.response?.data?.detail || '登录失败')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 0 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.login-header {
  text-align: center;
  margin-bottom: 40px;
  color: #fff;
}

.login-header h2 {
  font-size: 28px;
  margin: 0;
  font-weight: 700;
}

.login-header p {
  font-size: 14px;
  margin: 8px 0 0;
  opacity: 0.8;
}
</style>
