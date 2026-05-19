import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  Card, Input, Button, Typography, Space, Spin, Tooltip,
  Tag, Alert, Collapse, Divider, Upload, message,
} from 'antd'
import {
  SendOutlined, RobotOutlined, UserOutlined,
  DeleteOutlined, ClearOutlined, DollarOutlined,
  ClockCircleOutlined, PaperClipOutlined, FileTextOutlined,
  CloseOutlined,
} from '@ant-design/icons'
import api from '../api'

const { Text, Paragraph } = Typography
const { TextArea } = Input

function getToken() {
  return localStorage.getItem('admin_token') || ''
}

const exampleQuestions = [
  '帮我看看今天消耗了多少Token',
  '列出所有用户信息',
  '最近的充值订单有哪些',
  '帮我写一个分析SQL',
]

/** 文件类型图标 */
function FileIcon({ type }) {
  const colorMap = {
    pdf: '#f40',
    docx: '#2b5797',
    excel: '#217346',
    text: '#1677ff',
    code: '#1677ff',
    image: '#722ed1',
  }
  return (
    <FileTextOutlined style={{ color: colorMap[type] || '#999', marginRight: 4 }} />
  )
}

export default function Chat() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [currentCost, setCurrentCost] = useState(null)
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [healthStatus, setHealthStatus] = useState('checking')
  const messagesEndRef = useRef(null)
  const fileInputRef = useRef(null)

  const STORAGE_KEY = 'admin_chat_messages'

  /** 从 localStorage 加载 */
  const loadFromStorage = useCallback(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) setMessages(parsed)
      }
    } catch {}
  }, [])

  /** 保存到 localStorage */
  const saveToStorage = useCallback((msgs) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs))
    } catch {}
  }, [])

  /** 加载历史 + 健康检查 */
  useEffect(() => {
    loadFromStorage()
    const token = getToken()
    if (token) {
      fetch('/api/chat/history', {
        headers: { 'Authorization': `Bearer ${token}` },
      }).then(r => r.json()).then(data => {
        if (data.messages && data.messages.length > 0) {
          setMessages(data.messages)
          saveToStorage(data.messages)
        }
      }).catch(() => {})
      // 健康检查
      const check = () => {
        fetch('/api/chat/health', {
          headers: { 'Authorization': `Bearer ${token}` },
        }).then(r => r.json()).then(d => {
          setHealthStatus(d.status === 'ok' ? 'ok' : 'degraded')
        }).catch(() => setHealthStatus('down'))
      }
      check()
      const timer = setInterval(check, 15000)
      return () => clearInterval(timer)
    }
  }, [loadFromStorage])

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 50)
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, streamingText, scrollToBottom])

  /** 上传文件 */
  const handleFileSelect = async (e) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setUploading(true)
    const token = getToken()

    for (const file of files) {
      const formData = new FormData()
      formData.append('file', file)

      try {
        const res = await fetch('/api/chat/upload', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData,
        })
        if (!res.ok) {
          const err = await res.json()
          message.error(`${file.name}: ${err.detail || '上传失败'}`)
          continue
        }
        const data = await res.json()
        setUploadedFiles(prev => [...prev, {
          file_id: data.file_id,
          name: data.name,
          type: data.type,
          size: data.size,
        }])
        message.success(`✅ ${file.name} 已上传`)
      } catch (err) {
        message.error(`${file.name}: ${err.message}`)
      }
    }
    setUploading(false)
    // 清空 input 以支持重复选择同名文件
    e.target.value = ''
  }

  /** 移除已上传的文件 */
  const removeFile = (fileId) => {
    setUploadedFiles(prev => prev.filter(f => f.file_id !== fileId))
  }

  const sendMessage = async (text) => {
    const msg = text || input
    if (!msg.trim() || loading) return

    setInput('')
    setLoading(true)
    setStreamingText('')
    setCurrentCost(null)

    const userMsg = { role: 'user', content: msg, files: [...uploadedFiles] }
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)

    const history = messages.map(m => ({ role: m.role, content: m.content }))

    try {
      const token = getToken()
      const body = { message: msg, history }
      // 如果有上传的文件，带上
      if (uploadedFiles.length > 0) {
        body.files = uploadedFiles.map(f => ({ file_id: f.file_id, name: f.name }))
      }

      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const reader = response.body.getReader()
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
                setMessages((prev) => {
                  const next = [...prev, { role: 'assistant', content: data.content }]
                  // 保存到 localStorage
                  try { localStorage.setItem('admin_chat_messages', JSON.stringify(next)) } catch {}
                  // 同步到后端
                  const token = getToken()
                  if (token) {
                    fetch('/api/chat/history', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                      body: JSON.stringify({ messages: next }),
                    }).catch(() => {})
                  }
                  return next
                })
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
      // 发送完后不清除文件（用户可手动移除或继续提问）
      // setUploadedFiles([])
    }
  }

  const clearChat = () => {
    setMessages([])
    setStreamingText('')
    setCurrentCost(null)
    setUploadedFiles([])
    saveToStorage([])
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  /** 格式化文件大小 */
  const fmtSize = (bytes) => {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 4px' }}>
      {/* 头部 */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space>
          <RobotOutlined style={{ fontSize: 20, color: '#1677ff' }} />
          <Text strong style={{ fontSize: 16 }}>Claude Code AI 助手</Text>
          <Tag color="blue">DeepSeek Flash</Tag>
          <Tag
            color={healthStatus === 'ok' ? 'green' : healthStatus === 'checking' ? 'orange' : 'red'}
            style={{ fontSize: 11 }}
          >
            {healthStatus === 'ok' ? '● 在线' : healthStatus === 'checking' ? '◌ 检查中' : '○ 离线'}
          </Tag>
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
          height: 'calc(100vh - 340px)',
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
            <Paragraph type="secondary" style={{ fontSize: 13 }}>
              支持上传 txt / py / pdf / docx / xlsx / json / md 等文件
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
              }}
            >
              <div style={{ marginBottom: 4, fontSize: 12, opacity: 0.7 }}>
                {msg.role === 'user' ? <UserOutlined /> : <RobotOutlined />}
                <span style={{ marginLeft: 4 }}>
                  {msg.role === 'user' ? '你' : 'AI'}
                </span>
              </div>
              {/* 显示用户消息中的文件信息 */}
              {msg.files && msg.files.length > 0 && (
                <div style={{ marginBottom: 6, fontSize: 12, opacity: 0.8 }}>
                  {msg.files.map((f, fi) => (
                    <Tag key={fi} style={{ marginBottom: 2 }}>
                      <FileIcon type={f.type} /> {f.name}
                    </Tag>
                  ))}
                </div>
              )}
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
        {/* 已上传文件列表 */}
        {uploadedFiles.length > 0 && (
          <div style={{ marginBottom: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {uploadedFiles.map((f) => (
              <Tag
                key={f.file_id}
                closable
                onClose={() => removeFile(f.file_id)}
                style={{ margin: 0 }}
              >
                <FileIcon type={f.type} />
                {f.name}
                <span style={{ marginLeft: 4, opacity: 0.6, fontSize: 11 }}>
                  {fmtSize(f.size)}
                </span>
              </Tag>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
          {/* 附件按钮 */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={handleFileSelect}
              accept=".txt,.py,.js,.ts,.jsx,.tsx,.vue,.css,.html,.json,.yaml,.yml,.md,.csv,.xml,.sql,.sh,.toml,.ini,.cfg,.conf,.log,.env,.pdf,.docx,.xlsx,.xls,.go,.rs,.java,.c,.cpp,.h,.hpp,.rb,.php,.kt,.gradle,.proto,.graphql"
            />
            <Tooltip title="上传文件（txt/py/pdf/docx/xlsx 等）">
              <Button
                icon={uploading ? <Spin size="small" /> : <PaperClipOutlined />}
                onClick={() => fileInputRef.current?.click()}
                disabled={loading || uploading}
                size="large"
              />
            </Tooltip>
          </div>

          {/* 输入框 */}
          <TextArea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={uploadedFiles.length > 0 ? '输入关于这些文件的问题...' : '输入你的问题，按 Enter 发送...'}
            rows={2}
            disabled={loading}
            style={{ resize: 'none', flex: 1 }}
          />

          {/* 发送按钮 */}
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={() => sendMessage()}
            loading={loading}
            style={{ height: 'auto' }}
          >
            发送
          </Button>
        </div>
      </Card>
    </div>
  )
}
