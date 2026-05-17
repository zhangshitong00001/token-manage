<template>
  <div class="page">
    <!-- 个人信息 -->
    <div class="card" style="text-align:center;padding:24px;">
      <van-icon name="contact-o" size="48" color="#1989fa" />
      <h3 style="margin:8px 0;">{{ userInfo.nickname || '用户' }}</h3>
      <p style="color:#999;font-size:13px;">
        {{ userInfo.phone || userInfo.email || '未绑定手机/邮箱' }}
      </p>
    </div>

    <!-- 余额信息 -->
    <div class="card">
      <van-cell title="Token 余额" :value="formatNumber(userInfo.token_balance || 0)" />
      <van-cell title="角色" :value="userInfo.role === 'admin' ? '管理员' : '普通用户'" />
      <van-cell title="注册时间" :value="formatDate(userInfo.created_at)" />
    </div>

    <!-- DeepSeek API Key（管理员显示脱敏，点击眼睛才解密） -->
    <div class="card">
      <van-field
        v-model="apiKeyDisplay"
        :label="userInfo.role === 'admin' ? '🤖 Hermes Agent Key' : 'DeepSeek Key'"
        :placeholder="userInfo.role === 'admin' ? '正在加载...' : 'sk-xxx...xxxx'"
        :type="showKey ? 'text' : 'password'"
        :right-icon="showKey ? 'eye-o' : 'closed-eye'"
        @click-right-icon="toggleReveal"
        readonly
      />
      <div style="padding:0 16px 12px;font-size:12px;color:#999;">
        <span v-if="userInfo.role === 'admin'">
          ⚡ 点眼睛图标可查看完整 Key（仅当前会话可见）
        </span>
        <span v-else>
          绑定你自己的 DeepSeek Key 可查看私有消耗（暂未开放）
        </span>
      </div>
    </div>

    <!-- 模型偏好 -->
    <div class="card" style="margin-top:12px;">
      <van-cell title="偏好模型（平台用户）" />
      <div style="display:flex;gap:12px;padding:8px 16px 16px;">
        <van-button
          round
          :type="preferredModel === 'deepseek-v4-flash' ? 'primary' : 'default'"
          :plain="preferredModel !== 'deepseek-v4-flash'"
          size="small"
          style="flex:1;"
          @click="setModel('deepseek-v4-flash')"
        >
          ⚡ V4 Flash
          <div style="font-size:10px;opacity:0.7;">快速 · 便宜</div>
        </van-button>
        <van-button
          round
          :type="preferredModel === 'deepseek-v4-pro' ? 'primary' : 'default'"
          :plain="preferredModel !== 'deepseek-v4-pro'"
          size="small"
          style="flex:1;"
          @click="setModel('deepseek-v4-pro')"
        >
          🧠 V4 Pro
          <div style="font-size:10px;opacity:0.7;">更强 · 更准</div>
        </van-button>
      </div>
    </div>

    <!-- Hermes Agent 模型切换（仅管理员可见） -->
    <div class="card" style="margin-top:12px;border:1px solid #ffd666;" v-if="userInfo.role === 'admin'">
      <van-cell
        title="🤖 Hermes Agent 模型"
        :label="'当前: ' + (hermesModel === 'deepseek-v4-pro' ? 'V4 Pro' : 'V4 Flash')"
        value-style="font-weight:600;"
      >
        <template #value>
          <van-tag :type="hermesModel === 'deepseek-v4-pro' ? 'warning' : 'primary'">
            {{ hermesModel === 'deepseek-v4-pro' ? 'Pro' : 'Flash' }}
          </van-tag>
        </template>
      </van-cell>
      <div style="display:flex;gap:12px;padding:8px 16px 16px;">
        <van-button
          round
          :type="hermesModel === 'deepseek-v4-flash' ? 'primary' : 'default'"
          :plain="hermesModel !== 'deepseek-v4-flash'"
          size="small"
          style="flex:1;"
          :loading="switchingHermes"
          @click="switchHermes('deepseek-v4-flash')"
        >
          ⚡ 切换到 Flash
        </van-button>
        <van-button
          round
          :type="hermesModel === 'deepseek-v4-pro' ? 'warning' : 'default'"
          :plain="hermesModel !== 'deepseek-v4-pro'"
          size="small"
          style="flex:1;"
          :loading="switchingHermes"
          @click="switchHermes('deepseek-v4-pro')"
        >
          🧠 切换到 Pro
        </van-button>
      </div>
    </div>

    <!-- 文件上传（仅管理员） -->
    <van-cell
      v-if="userInfo.role === 'admin'"
      title="📁 文件上传"
      label="上传文件到服务器（最大 500MB）"
      is-link
      to="/upload"
      style="margin:0 12px;border-radius:12px;overflow:hidden;"
    />

    <!-- 退出登录 -->
    <van-button
      block
      round
      type="danger"
      plain
      style="margin-top:24px;"
      @click="onLogout"
    >
      退出登录
    </van-button>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import api, { logAction } from '../utils/api.js'

const router = useRouter()
const userInfo = ref({})
const apiKeyDisplay = ref('')  // 脱敏显示
const apiKeyFull = ref('')     // 完整 Key（仅点眼睛后获取）
const showKey = ref(false)
const revealing = ref(false)
const preferredModel = ref('deepseek-v4-flash')
const hermesModel = ref('deepseek-v4-flash')
const switchingHermes = ref(false)

function formatNumber(n) {
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿'
  if (n >= 10000) return (n / 10000).toFixed(1) + '万'
  return n.toLocaleString()
}

function formatDate(d) {
  if (!d) return ''
  return d.slice(0, 10)
}

async function toggleReveal() {
  if (!apiKeyFull.value) {
    // 还没有完整 Key，去获取
    if (revealing.value) return
    revealing.value = true
    try {
      const res = await api.post('/user/hermes-api-key/reveal')
      apiKeyFull.value = res.api_key
      apiKeyDisplay.value = res.api_key
      showKey.value = true
    } catch (e) {
      showToast('获取失败')
      showKey.value = false
    } finally {
      revealing.value = false
    }
  } else {
    // 已经有完整 Key，切换显隐
    showKey.value = !showKey.value
    apiKeyDisplay.value = showKey.value ? apiKeyFull.value : apiKeyFull.value
  }
}

async function setModel(model) {
  try {
    await api.put('/user/model-pref', { preferred_model: model })
    preferredModel.value = model
    showToast(`已切换到 ${model === 'deepseek-v4-flash' ? 'V4 Flash' : 'V4 Pro'}`)
    logAction('switch_model', '/profile', `切换模型: ${model}`)
  } catch (e) {
    showToast('切换失败')
  }
}

async function switchHermes(model) {
  switchingHermes.value = true
  try {
    const res = await api.post('/user/hermes-model', { preferred_model: model })
    hermesModel.value = res.model
    showToast(`✅ Hermes 已切换到 ${model === 'deepseek-v4-pro' ? 'V4 Pro' : 'V4 Flash'}`)
    logAction('switch_hermes', '/profile', `切换Hermes模型: ${model}`)
  } catch (e) {
    showToast(e.response?.data?.detail || '切换失败')
  } finally {
    switchingHermes.value = false
  }
}

function onLogout() {
  logAction('logout', '/profile', `用户退出登录: ${userInfo.value.nickname}`)
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  router.push('/login')
  showToast('已退出登录')
}

onMounted(async () => {
  try {
    const profile = await api.get('/user/profile')
    userInfo.value = profile
    preferredModel.value = profile.preferred_model || 'deepseek-v4-flash'
    // 如果是管理员，查询 Hermes Agent 当前模型和脱敏 Key
    if (profile.role === 'admin') {
      try {
        const h = await api.get('/user/hermes-model')
        hermesModel.value = h.model || 'deepseek-v4-flash'
      } catch (_) {}
      try {
        const k = await api.get('/user/hermes-api-key')
        apiKeyDisplay.value = k.api_key || ''
      } catch (_) {}
    }
  } catch (e) {
    console.error(e)
  }
})
</script>
