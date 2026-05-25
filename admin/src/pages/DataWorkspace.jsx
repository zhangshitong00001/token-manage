import React, { useState, useRef, useEffect } from 'react'
import {
  Card, Button, Upload, Input, message, Typography, Space,
  Tag, Spin, Empty, Alert, Tooltip,
} from 'antd'
import {
  UploadOutlined, PlayCircleOutlined, DownloadOutlined,
  FileExcelOutlined, FileTextOutlined, FileAddOutlined,
  DeleteOutlined, InboxOutlined, CheckCircleOutlined,
  CloseCircleOutlined, LoadingOutlined, RobotOutlined,
} from '@ant-design/icons'
import api from '../api'

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input
const { Dragger } = Upload

const exampleQueries = [
  '把第一列的空值填0，按日期排序输出',
  '合并所有上传文件，计算每个分类的总额',
  '清洗数据：删除重复行、统一日期格式',
  '根据A列和B列做匹配，输出匹配结果',
  '统计每月的销售额趋势，输出图表数据',
  '将.xlsx 转换为 CSV 格式',
]

export default function DataWorkspace() {
  const [files, setFiles] = useState([])
  const [query, setQuery] = useState('')
  const [processing, setProcessing] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [currentTool, setCurrentTool] = useState('')
  const [outputFiles, setOutputFiles] = useState([])
  const [status, setStatus] = useState('idle') // idle | processing | done | error
  const [logs, setLogs] = useState([])
  const streamRef = useRef(null)
  const logEndRef = useRef(null)

  // 自动滚动日志
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  // 清理 SSE
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.close()
        streamRef.current = null
      }
    }
  }, [])

  const handleUpload = async (uploadFile) => {
    const formData = new FormData()
    formData.append('file', uploadFile)

    try {
      const res = await api.post('/chat/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const newFile = {
        uid: res.file_id || Date.now(),
        name: res.name,
        type: res.type,
        size: res.size,
        file_id: res.file_id,
      }
      setFiles(prev => [...prev, newFile])
      message.success(`✅ ${res.name} 上传成功`)
    } catch (e) {
      message.error(`上传失败: ${e.response?.data?.detail || e.message}`)
    }
    return false // 阻止默认上传行为
  }

  const removeFile = (uid) => {
    setFiles(prev => prev.filter(f => f.uid !== uid))
  }

  const startProcess = async () => {
    if (!query.trim()) {
      message.warning('请描述你的数据处理需求')
      return
    }
    if (files.length === 0) {
      message.warning('请至少上传一个文件')
      return
    }

    setProcessing(true)
    setStatus('processing')
    setStreamText('')
    setCurrentTool('')
    setOutputFiles([])
    setLogs([])

    const fileListJson = JSON.stringify(files.map(f => ({
      name: f.name,
      type: f.type,
      size: f.size,
    })))

    try {
      const token = localStorage.getItem('admin_token')
      const res = await fetch(
        `/api/workspace/process` +
        `?files=${encodeURIComponent(fileListJson)}` +
        `&description=${encodeURIComponent(query)}`,
        {
          method: 'POST',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }
      )

      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        throw new Error(`HTTP ${res.status}${errText ? `: ${errText}` : ''}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const jsonStr = line.slice(6).trim()
          if (!jsonStr) continue

          try {
            const data = JSON.parse(jsonStr)
            handleStreamEvent(data)
          } catch { /* ignore parse errors */ }
        }
      }

      // 处理剩余 buffer
      if (buffer.startsWith('data: ')) {
        try {
          const data = JSON.parse(buffer.slice(6).trim())
          handleStreamEvent(data)
        } catch { /* ignore */ }
      }

    } catch (e) {
      setStatus('error')
      setLogs(prev => [...prev, { type: 'error', text: `连接失败: ${e.message}` }])
    } finally {
      setProcessing(false)
    }
  }

  const handleStreamEvent = (data) => {
    const type = data.type

    switch (type) {
      case 'start':
        setLogs(prev => [...prev, { type: 'info', text: data.message }])
        break
      case 'text':
        setStreamText(prev => prev + data.content)
        setLogs(prev => {
          const last = prev[prev.length - 1]
          if (last && last.type === 'output') {
            last.text += data.content
            return [...prev]
          }
          return [...prev, { type: 'output', text: data.content }]
        })
        break
      case 'tool':
        setCurrentTool(data.name)
        setLogs(prev => [...prev, {
          type: 'tool',
          text: `🔧 ${data.name}: ${data.command?.slice(0, 80) || ''}`,
        }])
        break
      case 'result':
        setLogs(prev => [...prev, { type: 'result', text: data.content }])
        break
      case 'done':
        setStatus('done')
        setOutputFiles(data.output_files || [])
        setCurrentTool('')
        setLogs(prev => [...prev, {
          type: 'success',
          text: `✅ 处理完成！耗时 ${(data.duration_ms / 1000).toFixed(1)}s，输出 ${(data.output_files || []).length} 个文件`,
        }])
        break
      case 'error':
        setStatus('error')
        setLogs(prev => [...prev, { type: 'error', text: `❌ ${data.message}` }])
        break
    }
  }

  const downloadFile = async (filename) => {
    try {
      const res = await api.get(`/workspace/download/${encodeURIComponent(filename)}`, {
        responseType: 'blob',
      })
      const url = URL.createObjectURL(new Blob([res]))
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      message.success(`⬇️ ${filename} 下载中`)
    } catch (e) {
      message.error('下载失败')
    }
  }

  const formatSize = (bytes) => {
    if (!bytes) return '0B'
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  }

  const getFileIcon = (type) => {
    switch (type) {
      case 'excel': return <FileExcelOutlined style={{ color: '#52c41a', fontSize: 20 }} />
      case 'code': return <FileTextOutlined style={{ color: '#1677ff', fontSize: 20 }} />
      default: return <FileAddOutlined style={{ color: '#fa8c16', fontSize: 20 }} />
    }
  }

  const statusTag = () => {
    switch (status) {
      case 'processing':
        return <Tag icon={<LoadingOutlined />} color="processing">处理中</Tag>
      case 'done':
        return <Tag icon={<CheckCircleOutlined />} color="success">已完成</Tag>
      case 'error':
        return <Tag icon={<CloseCircleOutlined />} color="error">出错</Tag>
      default:
        return <Tag color="default">就绪</Tag>
    }
  }

  return (
    <div>
      {/* 头部 */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <Title level={4} style={{ margin: 0 }}>
              <RobotOutlined style={{ marginRight: 8, color: '#667eea' }} />
              数据工作台
            </Title>
            <Text type="secondary">上传文件 → 说需求 → AI 自动处理 → 下载结果</Text>
          </div>
          {statusTag()}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>

        {/* 左侧：上传 + 输入 */}
        <div style={{ flex: '1 1 400px', minWidth: 300 }}>
          {/* 文件上传 */}
          <Card title="📎 上传文件" size="small" style={{ borderRadius: 12, marginBottom: 16 }}>
            <Dragger
              customRequest={({ file }) => handleUpload(file)}
              showUploadList={false}
              accept=".csv,.xlsx,.xls,.json,.txt,.md,.xml,.yaml,.yml,.log,.sql,.py,.js"
              style={{ borderRadius: 8 }}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p style={{ fontSize: 13, color: '#666' }}>
                点击或拖拽文件到此处上传
              </p>
              <p style={{ fontSize: 11, color: '#999' }}>
                支持 CSV / Excel / JSON / TXT / 代码文件等
              </p>
            </Dragger>

            {/* 已上传文件列表 */}
            {files.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <Text strong style={{ fontSize: 12, color: '#666' }}>
                  已上传 {files.length} 个文件
                </Text>
                {files.map(f => (
                  <div key={f.uid} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '6px 8px', marginTop: 4,
                    background: '#fafafa', borderRadius: 6, border: '1px solid #f0f0f0',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {getFileIcon(f.type)}
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 500 }}>{f.name}</div>
                        <div style={{ fontSize: 10, color: '#999' }}>{formatSize(f.size)}</div>
                      </div>
                    </div>
                    <Button type="text" size="small" danger
                      icon={<DeleteOutlined />} onClick={() => removeFile(f.uid)}
                    />
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* 需求描述 */}
          <Card title="💭 描述需求" size="small" style={{ borderRadius: 12, marginBottom: 16 }}>
            <TextArea
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="用自然语言描述你想怎么处理数据，例如：&quot;把销售额按月份汇总，生成报表&quot;"
              rows={4}
              style={{ borderRadius: 8, fontSize: 13 }}
            />
            <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {exampleQueries.map((q, i) => (
                <Tag key={i} style={{ cursor: 'pointer', fontSize: 11 }}
                  onClick={() => setQuery(q)}
                >{q}</Tag>
              ))}
            </div>
            <Button
              type="primary"
              size="large"
              block
              icon={processing ? <LoadingOutlined /> : <PlayCircleOutlined />}
              onClick={startProcess}
              disabled={processing || !query.trim() || files.length === 0}
              style={{
                marginTop: 12, height: 44, borderRadius: 8,
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                border: 'none', fontSize: 15, fontWeight: 500,
                boxShadow: '0 4px 12px rgba(102,126,234,0.4)',
              }}
            >
              {processing ? '处理中...' : '🚀 开始处理'}
            </Button>
          </Card>
        </div>

        {/* 右侧：处理日志 + 结果 */}
        <div style={{ flex: '2 1 500px', minWidth: 350 }}>
          {/* 处理日志 */}
          <Card
            title={
              <Space>
                <span>📋 处理日志</span>
                {currentTool && (
                  <Tag color="blue" style={{ fontSize: 11 }}>
                    🔧 {currentTool}
                  </Tag>
                )}
              </Space>
            }
            size="small"
            style={{ borderRadius: 12, marginBottom: 16 }}
            bodyStyle={{ padding: 0, maxHeight: 400, overflow: 'auto' }}
          >
            {logs.length === 0 ? (
              <Empty
                description="上传文件并描述需求，开始数据处理"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                style={{ padding: 40 }}
              />
            ) : (
              <div style={{ padding: 12, fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6 }}>
                {logs.map((log, i) => (
                  <div key={i} style={{
                    marginBottom: 4, padding: '2px 4px',
                    borderRadius: 4,
                    background: log.type === 'tool' ? '#f0f5ff' :
                                log.type === 'error' ? '#fff2f0' :
                                log.type === 'success' ? '#f6ffed' :
                                log.type === 'result' ? '#f9f0ff' : 'transparent',
                    color: log.type === 'error' ? '#ff4d4f' :
                           log.type === 'success' ? '#52c41a' :
                           log.type === 'tool' ? '#1677ff' :
                           log.type === 'result' ? '#722ed1' : '#333',
                  }}>
                    {log.text}
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            )}
          </Card>

          {/* 输出文件 */}
          {(outputFiles.length > 0 || status === 'done') && (
            <Card title="📦 输出文件" size="small" style={{ borderRadius: 12 }}>
              {outputFiles.length === 0 ? (
                <Text type="secondary" style={{ fontSize: 12 }}>未检测到输出文件</Text>
              ) : (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {outputFiles.map(f => (
                    <div key={f} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 12px', background: '#f6ffed',
                      borderRadius: 8, border: '1px solid #b7eb8f',
                    }}>
                      <FileExcelOutlined style={{ color: '#52c41a', fontSize: 18 }} />
                      <span style={{ fontSize: 12, fontWeight: 500 }}>{f}</span>
                      <Button type="primary" size="small" icon={<DownloadOutlined />}
                        onClick={() => downloadFile(f)}
                        style={{ borderRadius: 6 }}
                      >下载</Button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* 最终结果摘要 */}
          {status === 'done' && streamText && (
            <Card title="📝 处理摘要" size="small" style={{ borderRadius: 12, marginTop: 16 }}>
              <div style={{
                whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.7,
                maxHeight: 300, overflow: 'auto',
              }}>
                {streamText}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
