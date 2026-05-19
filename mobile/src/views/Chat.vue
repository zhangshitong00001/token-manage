<template>
  <div class="chat-page">
    <!-- 聊天头部 -->
    <div class="chat-header">
      <van-icon name="chat-o" size="20" color="#1989fa" />
      <span class="chat-title">AI 助手</span>
      <van-tag plain color="#1989fa" size="small">DeepSeek Flash</van-tag>
      <van-tag v-if="lastCost" plain color="#07c160" size="small">
        ${{ lastCost.toFixed(6) }}
      </van-tag>
      <van-icon
        name="delete-o"
        size="18"
        style="margin-left: auto; padding: 4px"
        @click="clearChat"
      />
    </div>

    <!-- 消息列表 -->
    <div class="chat-messages" ref="messagesRef">
      <!-- 空状态 -->
      <div v-if="messages.length === 0 && !streaming" class="chat-empty">
        <van-icon name="chat-o" size="48" color="#ccc" />
        <p style="color: #999; margin-top: 8px">
          AI 助手，查询数据、分析、写代码
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
          <van-icon :name="msg.role === 'user' ? 'contact' : 'chat' " />
          {{ msg.role === 'user' ? '你' : 'AI' }}
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
      <van-field
        v-model="input"
        type="textarea"
        :autosize="{ minHeight: 44, maxHeight: 100 }"
        placeholder="输入你的问题..."
        :disabled="loading"
        @keypress.enter.exact.prevent="sendMessage(input)"
      >
        <template #button>
          <van-button
            :icon="loading ? 'loading' : 'send'"
            :disabled="loading || !input.trim()"
            color="#1989fa"
            size="small"
            round
            @click="sendMessage(input)"
          />
        </template>
      </van-field>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick, watch } from 'vue'
import { showToast, showLoadingToast, closeToast } from 'vant'
import { useRouter } from 'vue-router'

const router = useRouter()
const input = ref('')
const messages = ref([])
const streaming = ref('')
const loading = ref(false)
const lastCost = ref(0)
const messagesRef = ref(null)
const scrollEnd = ref(null)

const BASE_URL = ''  // same origin

const exampleQuestions = [
  '帮我看看今天消耗了多少Token',
  '列出所有用户信息',
  '最近的充值订单有哪些',
  '帮我写一个分析SQL',
]

function getToken() {
  return localStorage.getItem('token') || ''
}

// 简单的 Markdown 渲染（纯文本 + 换行 + 代码块）
function renderContent(text) {
  if (!text) return ''
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // 代码块 (```code```)
    .replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre style="background:#f5f5f5;padding:8px;border-radius:6px;overflow-x:auto;font-size:12px;margin:4px 0"><code>$2</code></pre>')
    // 行内代码 (`code`)
    .replace(/`([^`]+)`/g, '<code style="background:#f0f0f0;padding:1px 4px;border-radius:3px;font-size:12px">$1</code>')
    // 加粗 **text**
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // 换行
    .replace(/\n/g, '<br>')
  return html
}

function scrollToBottom() {
  nextTick(() => {
    scrollEnd.value?.scrollIntoView({ behavior: 'smooth' })
  })
}

watch([messages, streaming], scrollToBottom)

async function sendMessage(text) {
  if (!text?.trim() || loading.value) return
  const msgText = text
  input.value = ''
  loading.value = true
  streaming.value = ''
  lastCost.value = 0

  messages.value.push({ role: 'user', content: msgText })

  const history = messages.value
    .filter(m => m.content !== msgText)
    .map(m => ({ role: m.role, content: m.content }))

  try {
    const token = getToken()
    const res = await fetch(`${BASE_URL}/api/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ message: msgText, history }),
    })

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let fullText = ''
    let buffer = ''  // SSE 行缓冲

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
            case 'done':
              lastCost.value = data.cost || 0
              messages.value.push({ role: 'assistant', content: data.content })
              streaming.value = ''
              break
            case 'error':
              streaming.value = (streaming.value || '') + `\n\n⚠️ ${data.message}`
              break
          }
        } catch (e) {}
      }
    }
  } catch (err) {
    streaming.value = `\n\n❌ 请求失败: ${err.message}`
  } finally {
    loading.value = false
    setTimeout(() => { streaming.value = '' }, 500)
  }
}

function clearChat() {
  messages.value = []
  streaming.value = ''
  lastCost.value = 0
}
</script>

<style scoped>
.chat-page {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 46px - 50px); /* minus nav-bar and tabbar */
}

.chat-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: #fff;
  border-bottom: 1px solid #eee;
}
.chat-title {
  font-size: 16px;
  font-weight: 600;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  background: #f7f8fa;
}

.chat-empty {
  text-align: center;
  padding: 40px 16px;
}

.msg-row {
  margin-bottom: 16px;
}
.msg-label {
  font-size: 12px;
  color: #999;
  margin-bottom: 4px;
}
.msg-user .msg-label {
  text-align: right;
}
.msg-bubble {
  max-width: 85%;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}
.msg-user {
  text-align: right;
}
.msg-user .msg-bubble {
  background: #1989fa;
  color: #fff;
  margin-left: auto;
  border-bottom-right-radius: 2px;
}
.msg-ai .msg-bubble {
  background: #fff;
  color: #333;
  margin-right: auto;
  border-bottom-left-radius: 2px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}
.msg-ai .msg-bubble :deep(pre) {
  background: #f5f5f5 !important;
  border-radius: 6px;
  overflow-x: auto;
}

.chat-input {
  background: #fff;
  border-top: 1px solid #eee;
  padding: 4px 0;
}
</style>
