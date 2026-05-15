<template>
  <div class="page">
    <van-form @submit="onLogin">
      <van-cell-group inset>
        <van-field
          v-model="account"
          name="account"
          label="账号"
          placeholder="手机号或邮箱"
          :rules="[{ required: true, message: '请输入账号' }]"
        />
        <van-field
          v-model="password"
          type="password"
          name="password"
          label="密码"
          placeholder="请输入密码"
          :rules="[{ required: true, message: '请输入密码' }]"
        />
      </van-cell-group>
      <div style="margin: 16px;">
        <van-button round block type="primary" native-type="submit" :loading="loading">
          登录
        </van-button>
      </div>
    </van-form>

    <div style="text-align:center;color:#999;font-size:13px;margin-top:8px;">
      还没有账号？
      <van-button type="primary" size="small" plain @click="showRegister = true">
        立即注册
      </van-button>
    </div>

    <!-- 注册弹窗 -->
    <van-dialog v-model:show="showRegister" title="注册新账号" show-cancel-button @confirm="onRegister">
      <van-form @submit="onRegister" style="padding:16px;">
        <van-field v-model="regPhone" label="手机号" placeholder="选填" />
        <van-field v-model="regEmail" label="邮箱" placeholder="选填" />
        <van-field v-model="regPassword" type="password" label="密码" placeholder="至少6位" />
      </van-form>
    </van-dialog>

    <!-- 测试账号提示 -->
    <van-notice-bar color="#1989fa" background="#ecf5ff" left-icon="info-o">
      测试账号: admin@tokenmanager.com / admin123
    </van-notice-bar>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import api, { logAction } from '../utils/api.js'

const router = useRouter()
const account = ref('admin@tokenmanager.com')
const password = ref('admin123')
const loading = ref(false)
const showRegister = ref(false)
const regPhone = ref('')
const regEmail = ref('')
const regPassword = ref('')

async function onLogin() {
  loading.value = true
  try {
    const res = await api.post('/auth/login', { account: account.value, password: password.value })
    localStorage.setItem('token', res.access_token)
    localStorage.setItem('user', JSON.stringify(res.user))
    logAction('login', '/login', `用户登录成功: ${account.value}`)
    showToast('登录成功')
    router.push('/home')
  } catch (e) {
    logAction('login_failed', '/login', `登录失败: ${account.value} - ${e.response?.data?.detail || '未知错误'}`)
    showToast(e.response?.data?.detail || '登录失败')
  } finally {
    loading.value = false
  }
}

async function onRegister() {
  try {
    await api.post('/auth/register', {
      phone: regPhone.value || null,
      email: regEmail.value || null,
      password: regPassword.value,
    })
    logAction('register', '/login', `新用户注册: ${regPhone.value || regEmail.value}`)
    showToast('注册成功，请登录')
  } catch (e) {
    showToast(e.response?.data?.detail || '注册失败')
  }
}
</script>
