import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  Card, Input, Button, Typography, Space, Spin, Tooltip,
  Tag, Alert, Collapse, Divider,
} from 'antd'
import {
  SendOutlined, RobotOutlined, UserOutlined,
  DeleteOutlined, ClearOutlined, DollarOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons'
import api from '../api'

const { Text, Paragraph } = Typography
const { TextArea } = Input

// API Token 从 localStorage 获取
function getToken() {
  return localStorage.getItem('admin_token') || ''
}

const exampleQuestions = [
  '帮我看看今天消耗了多少Token',
  '列出所有用户信息',
  '最近的充值订单有哪些',
  '帮我写一个分析SQL',
]

export default function Chat() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [currentCost, setCurrentCost] = useState(null)
  const messagesEndRef = useRef(null)
  const abortRef = useRef(null)

  // 自动滚动到底部
  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 50)
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, streamingText, scrollToBottom])

  const sendMessage = async (text) => {
    const msg = text || input
    if (!msg.trim() || loading) return

    setInput('')
    setLoading(true)
    setStreamingText('')
    setCurrentCost(null)

    // 添加用户消息
    const userMsg = { role: 'user', content: msg }
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)

    // 构建 history（不含最新消息）
    const history = messages.map(m => ({ role: m.role, content: m.content }))

    try {
      const token = getToken()
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ message: msg, history }),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))
            
            switch (data.type) {
              case 'text':
                fullText += data.content
                setStreamingText(fullText)
                break
              case 'tool_use':
                setStreamingText(
                  (prev) => prev + `\n\n[使用工具: ${data.name}]`
                )
                break
              case 'done':
                setCurrentCost({
                  cost: data.cost,
                  tokensInput: data.tokens_input,
                  tokensOutput: data.tokens_output,
                  duration: data.duration_ms,
                })
                setMessages((prev) => [
                  ...prev,
                  { role: 'assistant', content: data.content },
                ])
                setStreamingText('')
                break
              case 'error':
                setStreamingText((prev) => prev + `\n\n⚠️ ${data.message}`)
                break
            }
          } catch (e) {
            // ignore parse errors
          }
        }
      }
    } catch (err) {
      setStreamingText(`\n\n❌ 请求失败: ${err.message}`)
    } finally {
      setLoading(false)
      setStreamingText('')
    }
  }

  const clearChat = () => {
    setMessages([])
    setStreamingText('')
    setCurrentCost(null)
  }

  // 处理回车发送
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 4px' }}>
      {/* 头部 */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space>
          <RobotOutlined style={{ fontSize: 20, color: '#1677ff' }} />
          <Text strong style={{ fontSize: 16 }}>Claude Code AI 助手</Text>
          <Tag color="blue">DeepSeek Flash</Tag>
          {currentCost && (
            <>
              <Tag icon={<DollarOutlined />} color="green">
                ${(currentCost.cost || 0).toFixed(6)}
              </Tag>
              <Tag icon={<ClockCircleOutlined />} color="default">
                {(currentCost.duration / 1000).toFixed(1)}s
              </Tag>
            </>
          )}
          <Button
            size="small"
            icon={<ClearOutlined />}
            onClick={clearChat}
            danger
          >
            清空
          </Button>
        </Space>
      </Card>

      {/* 消息区域 */}
      <div
        style={{
          height: 'calc(100vh - 300px)',
          minHeight: 400,
          overflowY: 'auto',
          padding: '12px 0',
          marginBottom: 12,
        }}
      >
        {messages.length === 0 && !loading && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#999' }}>
            <RobotOutlined style={{ fontSize: 48, marginBottom: 16 }} />
            <Paragraph type="secondary">
              我是 AI 助手，可以帮你查询数据、分析代码、写 SQL 等
            </Paragraph>
            <Space wrap>
              {exampleQuestions.map((q, i) => (
                <Button
                  key={i}
                  type="dashed"
                  size="small"
                  onClick={() => sendMessage(q)}
                >
                  {q}
                </Button>
              ))}
            </Space>
          </div>
        )}

        {/* 消息列表 */}
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              marginBottom: 16,
            }}
          >
            <div
              style={{
                maxWidth: '80%',
                padding: '10px 14px',
                borderRadius: 12,
                background: msg.role === 'user' ? '#1677ff' : '#f5f5f5',
                color: msg.role === 'user' ? '#fff' : '#333',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontFamily: msg.role === 'assistant' ? 'inherit' : 'inherit',
              }}
            >
              <div style={{ marginBottom: 4, fontSize: 12, opacity: 0.7 }}>
                {msg.role === 'user' ? <UserOutlined /> : <RobotOutlined />}
                <span style={{ marginLeft: 4 }}>
                  {msg.role === 'user' ? '你' : 'AI'}
                </span>
              </div>
              <div>{msg.content}</div>
            </div>
          </div>
        ))}

        {/* 流式输出 */}
        {streamingText && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-start',
              marginBottom: 16,
            }}
          >
            <div
              style={{
                maxWidth: '80%',
                padding: '10px 14px',
                borderRadius: 12,
                background: '#f5f5f5',
                color: '#333',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              <div style={{ marginBottom: 4, fontSize: 12, opacity: 0.7 }}>
                <RobotOutlined /> <Spin size="small" style={{ marginLeft: 4 }} /> AI 正在输入...
              </div>
              <div>{streamingText}</div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 输入区域 */}
      <Card size="small">
        <Space.Compact style={{ width: '100%' }}>
          <TextArea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入你的问题，按 Enter 发送..."
            rows={2}
            disabled={loading}
            style={{ resize: 'none' }}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={() => sendMessage()}
            loading={loading}
            style={{ height: 'auto' }}
          >
            发送
          </Button>
        </Space.Compact>
      </Card>
    </div>
  )
}
