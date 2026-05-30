import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  Card, Input, Button, Typography, Space, Spin, Tooltip,
  Tag, Alert, Collapse, Divider, Upload, message, Drawer, List, Empty, Popconfirm,
} from 'antd'
import {
  SendOutlined, RobotOutlined, UserOutlined,
  DeleteOutlined, ClearOutlined, DollarOutlined,
  ClockCircleOutlined, PaperClipOutlined, FileTextOutlined,
  DownloadOutlined, CloseOutlined, FolderOpenOutlined,
  FileOutlined, DeleteOutlined as DeleteIcon, InboxOutlined,
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

/** 格式化文件大小 */
function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let size = bytes
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++ }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

/** 获取文件图标颜色 */
function getFileIcon(name) {
  const ext = name?.split('.').pop()?.toLowerCase()
  const icons = {
    csv: { color: '#52c41a', icon: '📊' },
    xlsx: { color: '#217346', icon: '📗' },
    xls: { color: '#217346', icon: '📗' },
    json: { color: '#fa8c16', icon: '📋' },
    pdf: { color: '#f40', icon: '📕' },
    docx: { color: '#2b5797', icon: '📘' },
    txt: { color: '#1677ff', icon: '📄' },
    md: { color: '#722ed1', icon: '📝' },
    py: { color: '#3572A5', icon: '🐍' },
    html: { color: '#e44d26', icon: '🌐' },
    sql: { color: '#e38c00', icon: '🗃️' },
    zip: { color: '#999', icon: '📦' },
  }
  return icons[ext] || { color: '#999', icon: '📄' }
}

/** 检查余额是否够用 */
async function checkUserBalance() {
  try {
    const res = await api.get('/user/my-usage')
    const balance = res.token_balance || 0
    if (balance <= 0) {
      message.warning({ content: `Token 余额不足（${balance.toLocaleString()}），请先充值`, duration: 5 })
      return false
    }
    return true
  } catch {
    return true
  }
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
  const [activeStream, setActiveStream] = useState(null)
  const [fileDrawerOpen, setFileDrawerOpen] = useState(false)
  const [myFiles, setMyFiles] = useState([])
  const [myFilesLoading, setMyFilesLoading] = useState(false)
  const [quotaInfo, setQuotaInfo] = useState(null) // {balance, today_used}
  const messagesEndRef = useRef(null)
  const fileInputRef = useRef(null)

  const STORAGE_KEY = 'admin_chat_messages'
  const saveTimerRef = useRef(null)

  /** 加载我的文件列表 */
  const loadMyFiles = async () => {
    setMyFilesLoading(true)
    try {
      const res = await api.get('/chat/my-files')
      setMyFiles(res.files || [])
    } catch { /* ignore */ }
    finally { setMyFilesLoading(false) }
  }

  /** 加载配额信息 */
  const loadQuotaInfo = async () => {
    try {
      const res = await api.get('/user/my-usage')
      setQuotaInfo({
        balance: res.token_balance || 0,
        todayCost: res.today?.total_cost || 0,
        todayCalls: res.today?.call_count || 0,
      })
    } catch { /* ignore */ }
  }

  /** 检查健康 + 加载历史 + 配额 */
  useEffect(() => {
    loadFromStorage()
    loadMyFiles()
    loadQuotaInfo()
    checkHealth()
  }, [])

  const checkHealth = async () => {
    try {
      await api.get('/admin/ping')
      setHealthStatus('ok')
    } catch {
      setHealthStatus('error')
    }
  }

  const loadFromStorage = useCallback(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) setMessages(JSON.parse(saved))
    } catch { /* ignore */ }
  }, [])

  const saveToStorage = useCallback((msgs) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs)) } catch { /* ignore */ }
    }, 500)
  }, [])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => { scrollToBottom() }, [messages, streamingText])

  /** 检查余额并发送 */
  const sendMessage = async (customMessage) => {
    const msg = customMessage || input
    if (!msg.trim()) return
    if (loading) return

    // 余额检查
    const hasBalance = await checkUserBalance()
    if (!hasBalance) return

    setInput('')
    const userMsg = { role: 'user', content: msg, files: [...uploadedFiles] }
    setMessages(prev => {
      const updated = [...prev, userMsg]
      saveToStorage(updated)
      return updated
    })
    setUploadedFiles([])
    setStreamingText('')
    setCurrentCost(null)
    setLoading(true)

    const history = messages.slice(-20).map(m => ({
      role: m.role,
      content: m.content,
    }))

    try {
      const res = await fetch(`/admin/api/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify({ message: msg, history, files: uploadedFiles }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        message.error(err.detail || `请求失败 (${res.status})`)
        setLoading(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let collected = ''
      let latestCost = null
      let latestOutputFiles = []
      let latestChangedFiles = []
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))

            if (data.type === 'text') {
              collected += data.content
              setStreamingText(collected)
            } else if (data.type === 'tool_use') {
              // silent
            } else if (data.type === 'tool_result') {
              // silent
            } else if (data.type === 'done') {
              latestCost = { cost: data.cost || 0, tokens_input: data.tokens_input, tokens_output: data.tokens_output, duration: data.duration_ms || 0 }
              latestOutputFiles = data.output_files || []
              latestChangedFiles = data.changed_files || []
              // 刷新配额和文件列表
              loadQuotaInfo()
              loadMyFiles()
            } else if (data.type === 'error') {
              message.error(data.message || '处理出错')
            }
          } catch { /* ignore */ }
        }
      }

      const assistantMsg = {
        role: 'assistant',
        content: collected || '(无回复)',
        cost: latestCost,
        output_files: latestOutputFiles,
        changed_files: latestChangedFiles,
      }
      setMessages(prev => {
        const updated = [...prev, assistantMsg]
        saveToStorage(updated)
        return updated
      })
      setStreamingText('')
      setLoading(false)
      setCurrentCost(latestCost)
    } catch (e) {
      message.error('请求失败: ' + (e.message || '网络错误'))
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  /** 上传文件 */
  const handleFileSelect = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await api.post('/chat/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      setUploadedFiles(prev => [...prev, { file_id: res.file_id || res.filename, name: file.name, type: file.name.split('.').pop() }])
      message.success(`已上传: ${file.name}`)
    } catch (e) {
      message.error('上传失败')
    } finally { setUploading(false); e.target.value = '' }
  }

  const removeFile = (fileId) => {
    setUploadedFiles(prev => prev.filter(f => f.file_id !== fileId))
  }

  const clearChat = () => {
    setMessages([])
    setStreamingText('')
    setCurrentCost(null)
    localStorage.removeItem(STORAGE_KEY)
    message.success('已清空对话')
  }

  /** 下载单个文件 */
  const downloadOutputFile = async (filename) => {
    const token = getToken()
    const url = `/admin/api/chat/download-output/${encodeURIComponent(filename)}`
    try {
      const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } })
      if (!resp.ok) { message.error('下载失败'); return }
      const blob = await resp.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = filename
      a.click()
      URL.revokeObjectURL(a.href)
    } catch { message.error('下载失败') }
  }

  /** 批量下载 */
  const downloadFiles = async (fileList) => {
    for (const f of fileList) {
      await downloadOutputFile(f)
    }
  }

  /** 删除文件 */
  const deleteMyFile = async (filename) => {
    try {
      await api.delete(`/chat/my-files/${encodeURIComponent(filename)}`)
      message.success(`已删除 ${filename}`)
      loadMyFiles()
    } catch (e) {
      message.error(e.response?.data?.detail || '删除失败')
    }
  }

  return (
    <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 120px)' }}>
      {/* 主聊天区域 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* 顶部栏 */}
        <Card size="small" style={{ marginBottom: 12, borderRadius: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space>
              <RobotOutlined style={{ fontSize: 18, color: '#667eea' }} />
              <Text strong>AI 对话</Text>
              {quotaInfo && (
                <>
                  <Tag color="blue" style={{ fontSize: 11 }}>
                    余额: {quotaInfo.balance.toLocaleString()}
                  </Tag>
                  <Tag style={{ fontSize: 11 }}>
                    今日: {quotaInfo.todayCost.toLocaleString()} Token
                  </Tag>
                </>
              )}
            </Space>
            <Space size={4}>
              <Tag style={{ fontSize: 11 }}>
                {healthStatus === 'ok' ? '● 在线' : healthStatus === 'checking' ? '◌ 检查中' : '○ 离线'}
              </Tag>
              {currentCost && (
                <>
                  <Tag icon={<DollarOutlined />} color="green">
                    ${(currentCost.cost || 0).toFixed(6)}
                  </Tag>
                  <Tag icon={<ClockCircleOutlined />}>
                    {(currentCost.duration / 1000).toFixed(1)}s
                  </Tag>
                </>
              )}
              <Button size="small" icon={<FolderOpenOutlined />}
                onClick={() => { loadMyFiles(); setFileDrawerOpen(true) }}
              >我的文件</Button>
              <Button size="small" icon={<ClearOutlined />} onClick={clearChat} danger>
                清空
              </Button>
            </Space>
          </div>
        </Card>

        {/* 检测到未完成的会话 */}
        {activeStream && (
          <Alert type={activeStream.active ? "warning" : "info"} showIcon
            icon={activeStream.active ? <ClockCircleOutlined /> : <RobotOutlined />}
            message={
              activeStream.active
                ? `检测到上次 AI 任务仍在运行（${activeStream.elapsed_seconds > 60 ? `${Math.floor(activeStream.elapsed_seconds / 60)}分钟` : `${activeStream.elapsed_seconds}秒`}前开始）`
                : `上次 AI 任务已完成（${activeStream.elapsed_seconds > 60 ? `${Math.floor(activeStream.elapsed_seconds / 60)}分钟` : `${activeStream.elapsed_seconds}秒`}）`
            }
            description={
              <div>
                <div style={{ marginBottom: 8, fontSize: 12, color: '#666', whiteSpace: 'pre-wrap', maxHeight: 100, overflow: 'auto' }}>
                  {activeStream.collected_text?.slice(-500) || '(暂无输出)'}
                </div>
                <Space>
                  <Button size="small" type="primary" onClick={() => setActiveStream(null)}>知道了，继续</Button>
                  <Button size="small" danger onClick={loadFromStorage}>刷新历史</Button>
                </Space>
              </div>
            }
            style={{ marginBottom: 12 }}
            closable onClose={() => setActiveStream(null)}
          />
        )}

        {/* 消息区域 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0', marginBottom: 12 }}>
          {messages.length === 0 && !loading && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#999' }}>
              <RobotOutlined style={{ fontSize: 48, marginBottom: 16 }} />
              <Paragraph type="secondary">我是 AI 助手，可以帮你查询数据、分析代码、写 SQL 等</Paragraph>
              <Paragraph type="secondary" style={{ fontSize: 13 }}>支持上传 txt / py / pdf / docx / xlsx / json / md 等文件</Paragraph>
              <Space wrap>
                {exampleQuestions.map((q, i) => (
                  <Button key={i} type="dashed" size="small" onClick={() => sendMessage(q)}>{q}</Button>
                ))}
              </Space>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 16 }}>
              <div style={{
                maxWidth: '80%', padding: '10px 14px', borderRadius: 12,
                background: msg.role === 'user' ? '#1677ff' : '#f5f5f5',
                color: msg.role === 'user' ? '#fff' : '#333',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                <div style={{ marginBottom: 4, fontSize: 12, opacity: 0.7 }}>
                  {msg.role === 'user' ? <UserOutlined /> : <RobotOutlined />}
                  <span style={{ marginLeft: 4 }}>{msg.role === 'user' ? '你' : 'AI'}</span>
                </div>

                {/* 用户消息 - 已上传文件 */}
                {msg.files && msg.files.length > 0 && (
                  <div style={{ marginBottom: 6, fontSize: 12, opacity: 0.8 }}>
                    {msg.files.map((f, fi) => (
                      <Tag key={fi} style={{ marginBottom: 2 }}><FileTextOutlined /> {f.name}</Tag>
                    ))}
                  </div>
                )}

                <div>{msg.content}</div>

                {/* 变更文件下载 */}
                {msg.changed_files && msg.changed_files.length > 0 && (
                  <div style={{ marginTop: 8, borderTop: '1px solid #e8e8e8', paddingTop: 8 }}>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>📁 本次变更文件（{msg.changed_files.length}个）</div>
                    <Space wrap size={2}>
                      {msg.changed_files.map((f, fi) => (
                        <Tag key={fi} style={{ fontSize: 11, maxWidth: 200 }}>{f}</Tag>
                      ))}
                    </Space>
                    <div style={{ marginTop: 6 }}>
                      <Button size="small" icon={<DownloadOutlined />} type="primary" ghost
                        onClick={() => downloadFiles(msg.changed_files)}
                      >打包下载所有文件</Button>
                    </div>
                  </div>
                )}

                {/* AI 生成文件下载 */}
                {msg.output_files && msg.output_files.length > 0 && (
                  <div style={{ marginTop: 10, borderTop: '1px solid #e8e8e8', paddingTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {msg.output_files.map((f, fi) => (
                      <div key={fi} style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '6px 10px', background: '#f6ffed',
                        borderRadius: 8, border: '1px solid #b7eb8f', fontSize: 12,
                      }}>
                        <span style={{ fontSize: 16 }}>{getFileIcon(f).icon}</span>
                        <span style={{ fontWeight: 500 }}>{f}</span>
                        <Button type="primary" size="small" icon={<DownloadOutlined />}
                          onClick={() => downloadOutputFile(f)}
                          style={{ borderRadius: 6, height: 24, fontSize: 11 }}
                        >下载</Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {streamingText && (
            <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 16 }}>
              <div style={{
                maxWidth: '80%', padding: '10px 14px', borderRadius: 12,
                background: '#f5f5f5', color: '#333', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
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
        <Card size="small" style={{ borderRadius: 12, flexShrink: 0 }}>
          {uploadedFiles.length > 0 && (
            <div style={{ marginBottom: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {uploadedFiles.map((f) => (
                <Tag key={f.file_id} closable onClose={() => removeFile(f.file_id)}
                  style={{ marginBottom: 2 }}
                ><FileTextOutlined /> {f.name}</Tag>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <input type="file" ref={fileInputRef} style={{ display: 'none' }}
              onChange={handleFileSelect}
              accept=".txt,.py,.js,.ts,.jsx,.tsx,.vue,.css,.html,.json,.yaml,.yml,.md,.csv,.xml,.sql,.sh,.toml,.ini,.cfg,.conf,.log,.env,.pdf,.docx,.xlsx,.xls,.go,.rs,.java,.c,.cpp,.h,.hpp,.rb,.php,.kt,.gradle,.proto,.graphql"
            />
            <Tooltip title="上传文件（txt/py/pdf/docx/xlsx 等）">
              <Button icon={uploading ? <Spin size="small" /> : <PaperClipOutlined />}
                onClick={() => fileInputRef.current?.click()}
                disabled={loading || uploading} size="large"
              />
            </Tooltip>
            <TextArea value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={uploadedFiles.length > 0 ? '输入关于这些文件的问题...' : '输入你的问题，按 Enter 发送...'}
              rows={2} disabled={loading}
              style={{ resize: 'none', flex: 1 }}
            />
            <Button type="primary" icon={<SendOutlined />} onClick={() => sendMessage()}
              loading={loading}
              style={{ height: 44, borderRadius: 8, minWidth: 44 }}
            />
          </div>
        </Card>
      </div>

      {/* 我的文件抽屉 */}
      <Drawer
        title={
          <Space>
            <InboxOutlined />
            <span>📁 我的文件</span>
            <Tag color="blue">{myFiles.length} 个文件</Tag>
          </Space>
        }
        placement="right"
        width={400}
        open={fileDrawerOpen}
        onClose={() => setFileDrawerOpen(false)}
        extra={<Button size="small" onClick={loadMyFiles} loading={myFilesLoading}>刷新</Button>}
      >
        {myFiles.length === 0 && !myFilesLoading && (
          <Empty description="暂无生成的文件" style={{ marginTop: 60 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>在 AI 对话中让 AI 生成文件后，会显示在这里</Text>
          </Empty>
        )}

        <List
          loading={myFilesLoading}
          dataSource={myFiles}
          renderItem={(file) => {
            const fi = getFileIcon(file.name)
            return (
              <List.Item
                style={{ padding: '10px 0' }}
                actions={[
                  <Tooltip title="下载" key="download">
                    <Button type="text" size="small" icon={<DownloadOutlined />}
                      onClick={() => downloadOutputFile(file.name)}
                    />
                  </Tooltip>,
                  <Popconfirm key="delete" title="确定删除这个文件？" onConfirm={() => deleteMyFile(file.name)}>
                    <Tooltip title="删除">
                      <Button type="text" size="small" danger icon={<DeleteIcon />} />
                    </Tooltip>
                  </Popconfirm>,
                ]}
              >
                <List.Item.Meta
                  avatar={<span style={{ fontSize: 24 }}>{fi.icon}</span>}
                  title={<Text style={{ fontSize: 13, wordBreak: 'break-all' }}>{file.name}</Text>}
                  description={
                    <Space size={8}>
                      <Text type="secondary" style={{ fontSize: 11 }}>{file.size_display || formatSize(file.size)}</Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>{file.mtime_display || new Date(file.mtime * 1000).toLocaleString('zh-CN')}</Text>
                    </Space>
                  }
                />
              </List.Item>
            )
          }}
        />
      </Drawer>
    </div>
  )
}
