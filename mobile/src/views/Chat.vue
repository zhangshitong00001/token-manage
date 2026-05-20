<template>
  <div class="chat-page">
    <!-- 聊天头部 -->
    <div class="chat-header">
      <van-icon name="chat-o" size="20" color="#1989fa" />
      <span class="chat-title">AI 助手</span>
      <!-- 状态指示灯 -->
      <span
        :class="['status-dot', `status-${healthStatus}`]"
        :title="healthHint"
      />
      <van-tag plain color="#1989fa" size="small">DeepSeek Flash</van-tag>
      <van-tag v-if="lastCost" plain color="#07c160" size="small" style="margin-right:4px">
        ${{ lastCost.toFixed(6) }}
      </van-tag>
      <div style="margin-left: auto; display: flex; gap: 8px; align-items: center">
        <van-icon
          name="add-square"
          size="18"
          color="#666"
          title="新对话"
          @click="newChat"
        />
      </div>
    </div>

    <!-- 消息列表 -->
    <div class="chat-messages" ref="messagesRef">
      <!-- 空状态 -->
      <div v-if="messages.length === 0 && !streaming" class="chat-empty">
        <van-icon name="chat-o" size="48" color="#ccc" />
        <p style="color: #999; margin-top: 8px">
          AI 助手，查询数据、分析、写代码
        </p>
        <p style="color: #bbb; margin-top: 4px; font-size: 12px">
          支持上传 txt / py / pdf / docx / xlsx 等文件
        </p>
        <van-space direction="vertical" :size="8" style="width: 80%">
          <van-button
            v-for="(q, i) in exampleQuestions"
            :key="i"
            plain
            hairline
            round
            size="small"
            color="#1989fa"
            @click="sendMessage(q)"
          >
            {{ q }}
          </van-button>
        </van-space>
      </div>

      <!-- 消息气泡 -->
      <div
        v-for="(msg, i) in messages"
        :key="i"
        :class="['msg-row', msg.role === 'user' ? 'msg-user' : 'msg-ai']"
      >
        <div class="msg-label">
          <van-icon :name="msg.role === 'user' ? 'contact' : 'chat'" />
          {{ msg.role === 'user' ? '你' : 'AI' }}
        </div>
        <!-- 用户消息中的文件信息 -->
        <div v-if="msg.files && msg.files.length > 0" style="margin-bottom:6px;font-size:12px;display:flex;flex-wrap:wrap;gap:4px">
          <van-tag v-for="(f, fi) in msg.files" :key="fi" plain size="small">
            📄 {{ f.name }}
          </van-tag>
        </div>
        <div class="msg-bubble" v-html="renderContent(msg.content)" />
      </div>

      <!-- 流式输出 -->
      <div v-if="streaming" class="msg-row msg-ai">
        <div class="msg-label">
          <van-icon name="chat" />
          AI
          <van-loading type="ball" size="14" style="display: inline-block; margin-left: 4px" />
        </div>
        <div class="msg-bubble" v-html="renderContent(streaming)" />
      </div>

      <div ref="scrollEnd" />
    </div>

    <!-- 输入区域 -->
    <div class="chat-input">
      <!-- 已上传文件列表 -->
      <div v-if="uploadedFiles.length > 0" class="chat-file-list">
        <div v-for="(f, i) in uploadedFiles" :key="f.file_id" class="chat-file-tag">
          <span>📄 {{ f.name }}</span>
          <van-icon name="close" size="14" @click="removeFile(i)" style="margin-left:4px;flex-shrink:0" />
        </div>
      </div>

      <div class="chat-input-row">
        <!-- 文件上传按钮 -->
        <van-icon
          name="add-o"
          size="22"
          color="#1989fa"
          class="chat-upload-btn"
          :class="{ disabled: loading || uploading }"
          @click="triggerFileUpload"
        />
        <input
          ref="fileInputRef"
          type="file"
          multiple
          style="display:none"
          @change="onFileSelect"
          accept=".txt,.py,.js,.ts,.vue,.css,.html,.json,.yaml,.yml,.md,.csv,.xml,.sql,.sh,.toml,.ini,.cfg,.log,.env,.pdf,.docx,.xlsx,.xls,.go,.rs,.java,.c,.cpp,.h,.hpp,.rb,.php,.kt,.gradle,.proto,.graphql"
        />

        <van-field
          v-model="input"
          type="textarea"
          :autosize="{ minHeight: 44, maxHeight: 100 }"
          :placeholder="uploadedFiles.length > 0 ? '输入关于这些文件的问题...' : '输入你的问题...'"
          :disabled="loading || uploading"
          @keypress.enter.exact.prevent="sendMessage(input)"
        >
          <template #button>
            <van-button
              :icon="loading ? 'loading' : 'send'"
              :disabled="loading || uploading || !input.trim()"
              color="#1989fa"
              size="small"
              round
              @click="sendMessage(input)"
            />
          </template>
        </van-field>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick, watch, onMounted, onUnmounted } from 'vue'
import { showToast, showConfirmDialog } from 'vant'
import { useRouter } from 'vue-router'

const router = useRouter()
const input = ref('')
const messages = ref([])
const streaming = ref('')
const loading = ref(false)
const lastCost = ref(0)
const uploadedFiles = ref([])
const uploading = ref(false)
const messagesRef = ref(null)
const scrollEnd = ref(null)
const fileInputRef = ref(null)

// ── 状态指示 ──
const healthStatus = ref('checking') // 'checking' | 'ok' | 'degraded' | 'down'
const healthHint = ref('检查中...')
let healthTimer = null

// ── 持久化 Key ──
const STORAGE_KEY = 'hermes_chat_messages'
const HEALTH_POLL_MS = 15000  // 15秒轮询

const BASE_URL = ''

const exampleQuestions = [
  '帮我看看今天消耗了多少Token',
  '列出所有用户信息',
  '最近的充值订单有哪些',
  '帮我写一个分析SQL',
]

function getToken() {
  return localStorage.getItem('token') || ''
}

// ── 健康检查 ──
async function checkHealth() {
  const token = getToken()
  if (!token) {
    healthStatus.value = 'down'
    healthHint.value = '未登录'
    return
  }
  try {
    const res = await fetch(`${BASE_URL}/api/chat/health`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    if (data.status === 'ok') {
      healthStatus.value = 'ok'
      healthHint.value = 'AI 助手在线'
    } else {
      healthStatus.value = 'degraded'
      healthHint.value = 'AI 助手异常: ' + (data.error || '')
    }
  } catch {
    healthStatus.value = 'down'
    healthHint.value = '后台不可用'
  }
}

function startHealthPoll() {
  checkHealth()
  healthTimer = setInterval(checkHealth, HEALTH_POLL_MS)
}

function stopHealthPoll() {
  if (healthTimer) {
    clearInterval(healthTimer)
    healthTimer = null
  }
}

// ── localStorage 持久化 ──
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        messages.value = parsed
      }
    }
  } catch {
    // ignore
  }
}

function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.value))
  } catch {
    // localStorage 满时忽略
  }
}

// ── 后端同步 ──
let saveDebounceTimer = null

function syncToBackend() {
  if (saveDebounceTimer) clearTimeout(saveDebounceTimer)
  saveDebounceTimer = setTimeout(async () => {
    const token = getToken()
    if (!token || messages.value.length === 0) return
    try {
      await fetch(`${BASE_URL}/api/chat/history`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ messages: messages.value }),
      })
    } catch {
      // 后端同步失败不影响前端使用
    }
  }, 1000)
}

async function loadFromBackend() {
  const token = getToken()
  if (!token) return
  try {
    const res = await fetch(`${BASE_URL}/api/chat/history`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
    if (!res.ok) return
    const data = await res.json()
    if (data.messages && data.messages.length > 0) {
      // 以后端数据为准，覆盖 localStorage
      messages.value = data.messages
      saveToStorage()
    }
  } catch {
    // ignore — localStorage 兜底
  }
}

// ── 生命周期 ──
onMounted(async () => {
  // 1) 快速从 localStorage 恢复（即时显示）
  loadFromStorage()
  // 2) 从后端同步（覆盖更新）
  await loadFromBackend()
  // 3) 开始健康检查
  startHealthPoll()
})

onUnmounted(() => {
  stopHealthPoll()
  if (saveDebounceTimer) clearTimeout(saveDebounceTimer)
  // 离开时保存
  saveToStorage()
})

// 消息变化时自动保存
watch(messages, () => {
  saveToStorage()
  syncToBackend()
}, { deep: true })

function renderContent(text) {
  if (!text) return ''
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre style="background:#f5f5f5;padding:8px;border-radius:6px;overflow-x:auto;font-size:12px;margin:4px 0"><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code style="background:#f0f0f0;padding:1px 4px;border-radius:3px;font-size:12px">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>')
  return html
}

function scrollToBottom() {
  nextTick(() => {
    scrollEnd.value?.scrollIntoView({ behavior: 'smooth' })
  })
}

watch([messages, streaming], scrollToBottom)

function triggerFileUpload() {
  if (loading.value || uploading.value) return
  fileInputRef.value?.click()
}

async function onFileSelect(e) {
  const files = e.target.files
  if (!files || files.length === 0) return

  uploading.value = true
  const token = getToken()

  for (const file of files) {
    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch(`${BASE_URL}/api/chat/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      })
      if (!res.ok) {
        const err = await res.json()
        showToast(err.detail || '上传失败')
        continue
      }
      const data = await res.json()
      uploadedFiles.value.push({
        file_id: data.file_id,
        name: data.name,
        type: data.type,
        size: data.size,
      })
      showToast(`✅ ${data.name}`)
    } catch (err) {
      showToast(err.message)
    }
  }
  uploading.value = false
  e.target.value = ''
}

function removeFile(index) {
  uploadedFiles.value.splice(index, 1)
}

function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

function newChat() {
  showConfirmDialog({
    title: '新对话',
    message: '清空当前对话并开始新对话？历史记录已自动保存。',
    confirmButtonText: '确定',
    cancelButtonText: '取消',
  }).then(() => {
    messages.value = []
    streaming.value = ''
    lastCost.value = 0
    input.value = ''
    uploadedFiles.value = []
    saveToStorage()
    syncToBackend()
  }).catch(() => {
    // 取消
  })
}

async function sendMessage(text) {
  if (!text?.trim() || loading.value) return
  const msgText = text
  input.value = ''
  loading.value = true
  streaming.value = ''
  lastCost.value = 0

  const files = [...uploadedFiles.value]
  messages.value.push({ role: 'user', content: msgText, files })

  const history = messages.value
    .filter(m => m.content !== msgText)
    .map(m => ({ role: m.role, content: m.content }))

  try {
    const token = getToken()
    const body = { message: msgText, history }
    if (files.length > 0) {
      body.files = files.map(f => ({ file_id: f.file_id, name: f.name }))
    }

    const res = await fetch(`${BASE_URL}/api/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let fullText = ''
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data: ')) continue
        try {
          const data = JSON.parse(trimmed.slice(6))
          switch (data.type) {
            case 'text':
              fullText += data.content
              streaming.value = fullText
              break
            case 'tool_use': {
              const cmd = data.input?.command || ''
              const label = cmd ? `$ ${cmd}` : `[使用工具: ${data.name}]`
              fullText += `\n\n🔧 ${label}\n`
              streaming.value = fullText
              break
            }
            case 'tool_result': {
              const icon = data.is_error ? '❌' : '📋'
              const lines = (data.content || '').split('\n')
              const preview = lines.length > 6
                ? lines.slice(0, 6).join('\n') + `\n... (${lines.length} lines)`
                : data.content
              const cmdLine = data.command ? `$ ${data.command}` : ''
              fullText += `\n${icon} ${cmdLine || data.tool_name}\n\`\`\`\n${preview}\n\`\`\`\n`
              streaming.value = fullText
              break
            }
            case 'done':
              lastCost.value = data.cost || 0
              messages.value.push({ role: 'assistant', content: data.content })
              streaming.value = ''
              break
            case 'error':
              streaming.value = (streaming.value || '') + `\n\n⚠️ ${data.message}`
              break
          }
        } catch (e) {
          // ignore
        }
      }
    }
  } catch (err) {
    showToast(err.message)
  } finally {
    loading.value = false
    streaming.value = ''
  }
}
</script>

<style scoped>
.chat-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f7f8fa;
}

.chat-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  background: #fff;
  border-bottom: 1px solid #eee;
  gap: 8px;
  flex-shrink: 0;
}

.chat-title {
  font-size: 16px;
  font-weight: 600;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  -webkit-overflow-scrolling: touch;
}

.chat-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  padding: 20px;
  text-align: center;
}

.msg-row {
  margin-bottom: 16px;
}

.msg-user {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.msg-ai {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.msg-label {
  font-size: 12px;
  color: #999;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.msg-bubble {
  max-width: 85%;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.6;
  word-break: break-word;
  white-space: pre-wrap;
}

.msg-user .msg-bubble {
  background: #1989fa;
  color: #fff;
  border-bottom-right-radius: 4px;
}

.msg-ai .msg-bubble {
  background: #fff;
  color: #333;
  border-bottom-left-radius: 4px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}

.chat-input {
  background: #fff;
  border-top: 1px solid #eee;
  flex-shrink: 0;
}

.chat-file-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 12px 0;
}

.chat-file-tag {
  display: inline-flex;
  align-items: center;
  background: #e8f4fd;
  border: 1px solid #b3d8f0;
  border-radius: 16px;
  padding: 3px 8px;
  font-size: 12px;
  color: #1989fa;
  gap: 2px;
}

.chat-input-row {
  display: flex;
  align-items: flex-end;
  padding: 8px 12px;
  gap: 8px;
}

.chat-upload-btn {
  margin-bottom: 8px;
  cursor: pointer;
  flex-shrink: 0;
}

.chat-upload-btn.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.chat-input-row :deep(.van-field) {
  flex: 1;
  padding: 0;
}

/* 状态指示灯 */
.status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  transition: background 0.3s;
}
.status-checking {
  background: #ff9800;
  animation: pulse 1s infinite;
}
.status-ok {
  background: #07c160;
}
.status-degraded {
  background: #ff9800;
}
.status-down {
  background: #ee0a24;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
