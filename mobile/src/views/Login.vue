<template>
  <div class="page">
    <div class="login-header">
      <h2>TokenManager</h2>
      <p>欢迎回来</p>
    </div>

    <!-- 登录/注册 标签切换 -->
    <van-tabs v-model:active="activeTab" color="#667eea" title-active-color="#667eea" class="auth-tabs">
      <van-tab title="登录" name="login">
        <van-form @submit="onLogin">
          <van-cell-group inset>
            <van-field
              v-model="email"
              name="email"
              label="邮箱"
              placeholder="请输入邮箱"
              :rules="[{ required: true, message: '请输入邮箱' }, { pattern: /@/, message: '邮箱格式不正确' }]"
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
      </van-tab>

      <van-tab title="注册" name="register">
        <van-form @submit="onRegister">
          <van-cell-group inset>
            <van-field
              v-model="regEmail"
              name="regEmail"
              label="邮箱"
              placeholder="请输入邮箱"
              :rules="[{ required: true, message: '请输入邮箱' }, { pattern: /@/, message: '邮箱格式不正确' }]"
            >
              <template #button>
                <van-button
                  size="small"
                  type="primary"
                  :disabled="!canRegSendCode"
                  :loading="regSendingCode"
                  @click="onRegSendCode"
                >
                  {{ regSendCodeText }}
                </van-button>
              </template>
            </van-field>
            <van-field
              v-model="regCode"
              type="text"
              name="regCode"
              label="验证码"
              placeholder="请输入6位验证码"
              maxlength="6"
              :rules="[{ required: true, message: '请输入验证码' }, { pattern: /^\d{6}$/, message: '请输入6位数字验证码' }]"
            />
            <van-field
              v-model="regNickname"
              name="regNickname"
              label="昵称"
              placeholder="请输入昵称（选填）"
            />
            <van-field
              v-model="regPassword"
              type="password"
              name="regPassword"
              label="密码"
              placeholder="请设置密码（至少6位）"
              :rules="[{ required: true, message: '请设置密码' }, { pattern: /^.{6,}$/, message: '密码至少6位' }]"
            />
          </van-cell-group>
          <div style="margin: 16px;">
            <van-button round block type="primary" native-type="submit" :loading="regLoading">
              注册
            </van-button>
          </div>
        </van-form>
      </van-tab>
    </van-tabs>
  </div>
</template>

<script setup>
import { ref, computed, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import api, { logAction } from '../utils/api.js'

const router = useRouter()

// 登录
const email = ref('')
const code = ref('')
const loading = ref(false)
const sendingCode = ref(false)
const countdown = ref(0)

// 注册
const regEmail = ref('')
const regCode = ref('')
const regNickname = ref('')
const regPassword = ref('')
const regLoading = ref(false)
const regSendingCode = ref(false)
const regCountdown = ref(0)

const activeTab = ref('login')

// 登录验证码
const canSendCode = computed(() => countdown.value <= 0 && email.value.includes('@'))
const sendCodeText = computed(() => {
  if (sendingCode.value) return '发送中...'
  if (countdown.value > 0) return `${countdown.value}s`
  return '获取验证码'
})

// 注册验证码
const canRegSendCode = computed(() => regCountdown.value <= 0 && regEmail.value.includes('@'))
const regSendCodeText = computed(() => {
  if (regSendingCode.value) return '发送中...'
  if (regCountdown.value > 0) return `${regCountdown.value}s`
  return '获取验证码'
})

let loginTimer = null
let regTimer = null

// ====== 登录 ======
async function onSendCode() {
  if (!canSendCode.value) return
  sendingCode.value = true
  try {
    const res = await api.post('/auth/send-code', { email: email.value })
    showToast(res.message || '验证码已发送')
    countdown.value = 60
    loginTimer = setInterval(() => {
      countdown.value--
      if (countdown.value <= 0) { clearInterval(loginTimer); loginTimer = null }
    }, 1000)
  } catch (e) {
    showToast(e.response?.data?.detail || '发送失败')
  } finally { sendingCode.value = false }
}

async function onLogin() {
  loading.value = true
  try {
    const res = await api.post('/auth/code-login', { email: email.value, code: code.value, remember_me: true })
    localStorage.setItem('token', res.access_token)
    localStorage.setItem('user', JSON.stringify(res.user))
    logAction('login', '/login', `用户登录成功: ${email.value}`)
    showToast('登录成功')
    router.push('/home')
  } catch (e) {
    logAction('login_failed', '/login', `登录失败: ${email.value} - ${e.response?.data?.detail || '未知错误'}`)
    showToast(e.response?.data?.detail || '登录失败')
  } finally { loading.value = false }
}

// ====== 注册 ======
async function onRegSendCode() {
  if (!canRegSendCode.value) return
  regSendingCode.value = true
  try {
    const res = await api.post('/auth/send-code', { email: regEmail.value })
    showToast(res.message || '验证码已发送')
    regCountdown.value = 60
    regTimer = setInterval(() => {
      regCountdown.value--
      if (regCountdown.value <= 0) { clearInterval(regTimer); regTimer = null }
    }, 1000)
  } catch (e) {
    showToast(e.response?.data?.detail || '发送失败')
  } finally { regSendingCode.value = false }
}

async function onRegister() {
  if (!regPassword.value || regPassword.value.length < 6) {
    showToast('密码至少6位')
    return
  }
  regLoading.value = true
  try {
    const body = {
      email: regEmail.value,
      code: regCode.value,
      password: regPassword.value,
    }
    if (regNickname.value) body.nickname = regNickname.value
    await api.post('/auth/register', body)
    showToast('注册成功，请登录')
    // 切回登录tab，填入邮箱
    email.value = regEmail.value
    activeTab.value = 'login'
  } catch (e) {
    showToast(e.response?.data?.detail || '注册失败')
  } finally { regLoading.value = false }
}

onUnmounted(() => {
  if (loginTimer) clearInterval(loginTimer)
  if (regTimer) clearInterval(regTimer)
})
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
  margin-bottom: 20px;
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

.auth-tabs {
  background: transparent;
}
.auth-tabs :deep(.van-tabs__wrap) {
  margin-bottom: 16px;
}
.auth-tabs :deep(.van-tab) {
  color: rgba(255,255,255,0.7);
}
.auth-tabs :deep(.van-tab--active) {
  color: #fff;
  font-weight: 600;
}
</style>
