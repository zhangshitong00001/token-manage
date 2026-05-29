import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  Layout, Menu, Button, Select, InputNumber, Switch, Tag, Space,
  Typography, Modal, message, Tooltip, Spin, Input, Badge, Drawer,
  Slider, Divider, Dropdown,
} from 'antd'
import {
  PlayCircleOutlined, StopOutlined, DeleteOutlined,
  SettingOutlined, CodeOutlined, RobotOutlined,
  DownOutlined, RightOutlined, ReloadOutlined,
  PlusOutlined, MinusOutlined, FullscreenOutlined,
  BgColorsOutlined, ClearOutlined,
} from '@ant-design/icons'
import api from '../api'

const { Text, Title } = Typography
const { TextArea } = Input

// ── 参数面板 ──
const MODE_OPTIONS = [
  { value: 'auto', label: 'Auto', desc: '自动批准所有操作' },
  { value: 'normal', label: 'Normal', desc: '默认模式，需确认' },
  { value: 'plan', label: 'Plan', desc: '只规划不执行' },
  { value: 'acceptEdits', label: 'AcceptEdits', desc: '接受文件编辑' },
]
const MODEL_OPTIONS = [
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'opus', label: 'Opus' },
  { value: 'haiku', label: 'Haiku' },
]
const EFFORT_OPTIONS = [
  { value: 'low', label: 'Low (快)' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'max', label: 'Max (深)' },
]

export default function ClaudeTerminal() {
  // ── 状态 ──
  const [config, setConfig] = useState({
    mode: 'auto',
    model: 'sonnet',
    effort: 'medium',
    max_turns: 30,
    skip_permissions: true,
    project_dir: '/root/TokenManager',
  })
  const [sessions, setSessions] = useState([])
  const [activeSession, setActiveSession] = useState(null)
  const [wsConnected, setWsConnected] = useState(false)
  const [outputLines, setOutputLines] = useState([])
  const [inputText, setInputText] = useState('')
  const [initialPrompt, setInitialPrompt] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [starting, setStarting] = useState(false)
  const [historyVisible, setHistoryVisible] = useState(false)
  const [historyRecords, setHistoryRecords] = useState([])
  const wsRef = useRef(null)
  const outputRef = useRef(null)
  const maxLinesRef = useRef(1000)

  // ── 获取会话列表 ──
  const fetchSessions = useCallback(async () => {
    try {
      const token = localStorage.getItem('admin_token')
      if (!token) return
      const res = await api.get('/api/claude-terminal/sessions')
      setSessions(res.sessions || [])
    } catch {}
  }, [])

  useEffect(() => {
    fetchSessions()
    const timer = setInterval(fetchSessions, 5000)
    return () => clearInterval(timer)
  }, [fetchSessions])

  // ── WebSocket 连接 ──
  const connectWS = useCallback((sessionId) => {
    if (wsRef.current) {
      wsRef.current.close()
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const ws = new WebSocket(`${protocol}//${host}/api/claude-terminal/ws/${sessionId}`)

    ws.onopen = () => {
      setWsConnected(true)
      setOutputLines(prev => [...prev, { type: 'system', text: '🟢 WebSocket 已连接' }])
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        switch (msg.type) {
          case 'output':
            setOutputLines(prev => {
              const next = [...prev, { type: 'output', text: msg.data }]
              if (next.length > maxLinesRef.current) {
                return next.slice(-maxLinesRef.current)
              }
              return next
            })
            break
          case 'status':
            if (msg.state === 'stopped') {
              setOutputLines(prev => [...prev, { type: 'system', text: '⏹ 会话已结束' }])
              fetchSessions()
            }
            break
          case 'error':
            setOutputLines(prev => [...prev, { type: 'error', text: `❌ ${msg.message}` }])
            break
        }
      } catch {}
    }

    ws.onclose = () => {
      setWsConnected(false)
      setOutputLines(prev => [...prev, { type: 'system', text: '🔴 WebSocket 已断开' }])
      fetchSessions()
    }

    ws.onerror = () => {
      setOutputLines(prev => [...prev, { type: 'error', text: '❌ WebSocket 连接错误' }])
    }

    wsRef.current = ws
  }, [fetchSessions])

  // ── 断开 WS ──
  const disconnectWS = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setWsConnected(false)
    setActiveSession(null)
  }, [])

  // ── 启动新会话 ──
  const startSession = async () => {
    if (starting) return
    setStarting(true)
    try {
      const token = localStorage.getItem('admin_token')
      if (!token) {
        message.error('请先登录')
        return
      }
      const res = await fetch('/api/claude-terminal/session/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          config,
          initial_prompt: initialPrompt,
        }),
      })
      const data = await res.json()
      if (data.session_id) {
        message.success('✅ 会话已启动')
        setOutputLines([
          { type: 'system', text: `🚀 会话 ${data.session_id} 已启动` },
          { type: 'system', text: `模式: ${config.mode} | 模型: ${config.model} | Effort: ${config.effort}` },
          { type: 'system', text: initialPrompt ? `Prompt: ${initialPrompt}` : '(交互模式)' },
          { type: 'system', text: '─'.repeat(60) },
        ])
        setActiveSession(data.session_id)
        connectWS(data.session_id)
        fetchSessions()
        setInitialPrompt('')
      } else {
        message.error(data.error || '启动失败')
      }
    } catch (err) {
      message.error(`启动失败: ${err.message}`)
    } finally {
      setStarting(false)
    }
  }

  // ── 停止会话 ──
  const stopSession = async () => {
    if (!activeSession) return
    try {
      const token = localStorage.getItem('admin_token')
      await fetch(`/api/claude-terminal/session/${activeSession}/stop`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      })
      message.info('⏹ 已发送停止指令')
    } catch (err) {
      message.error(`停止失败: ${err.message}`)
    }
  }

  // ── 发送信号 ──
  const sendSignal = (sig) => {
    if (!activeSession || !wsRef.current) return
    wsRef.current.send(JSON.stringify({ type: 'signal', signal: sig }))
    setOutputLines(prev => [...prev, { type: 'system', text: `⌨️ 发送信号: ${sig}` }])
  }

  // ── 发送输入 ──
  const sendInput = () => {
    if (!inputText.trim() || !activeSession || !wsRef.current) return
    const text = inputText + '\n'
    wsRef.current.send(JSON.stringify({ type: 'input', data: text }))
    setOutputLines(prev => [...prev, { type: 'input', text: `$ ${inputText}` }])
    setInputText('')
  }

  // ── 清除输出 ──
  const clearOutput = () => {
    setOutputLines([])
  }

  // ── 自动滚动到底部 ──
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [outputLines])

  // ── 加载深度历史 ──
  const loadHistoryFromBackend = async () => {
    try {
      const token = localStorage.getItem('admin_token')
      if (!token) return
      const res = await fetch('/api/chat/history', {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.messages?.length > 0) {
        setHistoryRecords(data.messages)
        setHistoryVisible(true)
      } else {
        message.info('暂无历史记录')
      }
    } catch {
      message.error('加载历史失败')
    }
  }

  // ── 键盘快捷键 ──
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendInput()
    }
  }

  // ── 格式化输出（ANSI 简易处理） ──
  const formatOutput = (text) => {
    // 移除 ANSI 转义序列
    return text
      .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
      .replace(/\x1b\][0-9;]*[^\x1b]*(\x1b\\)?/g, '')
  }

  // ── 渲染 ──
  return (
    <Layout style={{ height: 'calc(100vh - 100px)', background: '#1a1a2e', borderRadius: 8, overflow: 'hidden' }}>
      {/* ── 顶部工具栏 ── */}
      <div style={{
        background: '#16213e', padding: '8px 16px',
        display: 'flex', alignItems: 'center', gap: 8,
        borderBottom: '1px solid #0f3460',
      }}>
        <CodeOutlined style={{ color: '#00ff88', fontSize: 18 }} />
        <Text style={{ color: '#e0e0e0', fontWeight: 600, fontSize: 14, marginRight: 8 }}>
          Claude Code Terminal
        </Text>

        <Badge status={wsConnected ? 'success' : 'default'} />
        <Text style={{ color: wsConnected ? '#00ff88' : '#888', fontSize: 12, marginRight: 12 }}>
          {wsConnected ? '已连接' : '未连接'}
        </Text>

        <Button
          size="small"
          type="primary"
          icon={<PlayCircleOutlined />}
          onClick={startSession}
          loading={starting}
          style={{ background: '#00a86b', borderColor: '#00a86b' }}
        >
          新会话
        </Button>

        <Button
          size="small"
          icon={<StopOutlined />}
          onClick={stopSession}
          disabled={!activeSession}
          danger
        >
          停止
        </Button>

        <Button
          size="small"
          icon={<ClearOutlined />}
          onClick={clearOutput}
        >
          清屏
        </Button>

        <Button
          size="small"
          icon={<ReloadOutlined />}
          onClick={fetchSessions}
        >
          刷新
        </Button>

        <div style={{ flex: 1 }} />

        <Button
          size="small"
          icon={<SettingOutlined />}
          onClick={() => setSettingsOpen(true)}
          type={settingsOpen ? 'primary' : 'default'}
        >
          参数
        </Button>

        <Button
          size="small"
          icon={<BgColorsOutlined />}
          onClick={loadHistoryFromBackend}
        >
          历史
        </Button>
      </div>

      <Layout style={{ flex: 1, background: '#1a1a2e' }}>
        {/* ── 侧栏：会话列表 ── */}
        <div style={{
          width: 240, background: '#16213e',
          borderRight: '1px solid #0f3460',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: '8px 12px', color: '#888', fontSize: 12, borderBottom: '1px solid #0f3460' }}>
            会话列表 ({sessions.length})
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: 4 }}>
            {sessions.length === 0 ? (
              <div style={{ padding: 16, textAlign: 'center', color: '#555', fontSize: 12 }}>
                暂无会话<br />点击「新会话」开始
              </div>
            ) : (
              sessions.map(s => (
                <div
                  key={s.session_id}
                  onClick={() => {
                    setActiveSession(s.session_id)
                    setOutputLines([])
                    connectWS(s.session_id)
                  }}
                  style={{
                    padding: '8px 12px',
                    cursor: 'pointer',
                    borderRadius: 4,
                    marginBottom: 2,
                    background: activeSession === s.session_id ? '#0f3460' : 'transparent',
                    borderLeft: activeSession === s.session_id ? '3px solid #00ff88' : '3px solid transparent',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Badge status={s.status === 'running' ? 'processing' : 'default'} />
                    <Text style={{ color: '#ccc', fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.session_id.slice(-8)}
                    </Text>
                    <Tag color={s.status === 'running' ? 'green' : 'default'} style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>
                      {s.mode}
                    </Tag>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── 主区域：终端输出 + 输入 ── */}
        <Layout style={{ flex: 1, background: '#1a1a2e' }}>
          {/* 输出区 */}
          <div
            ref={outputRef}
            style={{
              flex: 1, overflow: 'auto', padding: 12,
              fontFamily: "'Courier New', Consolas, monospace",
              fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {outputLines.length === 0 && !activeSession && (
              <div style={{ textAlign: 'center', paddingTop: 80, color: '#555' }}>
                <RobotOutlined style={{ fontSize: 40, display: 'block', marginBottom: 16, color: '#333' }} />
                <Text style={{ color: '#555', fontSize: 14 }}>
                  点击「新会话」启动 Claude Code 终端
                </Text>
                <div style={{ marginTop: 8, color: '#444', fontSize: 12 }}>
                  支持 Auto / Normal / Plan / AcceptEdits 四种模式
                </div>
              </div>
            )}
            {outputLines.length === 0 && activeSession && (
              <div style={{ textAlign: 'center', paddingTop: 80, color: '#555', fontSize: 13 }}>
                <Spin size="small" /> 等待会话输出...
              </div>
            )}
            {outputLines.map((line, i) => {
              let color = '#e0e0e0'
              if (line.type === 'system') color = '#00ff88'
              if (line.type === 'error') color = '#ff6b6b'
              if (line.type === 'input') color = '#ffd93d'
              return (
                <div key={i} style={{ color, minHeight: 18 }}>
                  {formatOutput(line.text)}
                </div>
              )
            })}
          </div>

          {/* 输入区 */}
          <div style={{
            background: '#16213e', padding: '8px 12px',
            borderTop: '1px solid #0f3460',
            display: 'flex', gap: 8, alignItems: 'flex-end',
          }}>
            <div style={{ color: '#00ff88', fontFamily: 'monospace', paddingBottom: 8, fontSize: 14 }}>$</div>
            <TextArea
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={activeSession ? '输入命令...' : '请先启动一个新会话'}
              disabled={!activeSession}
              rows={1}
              style={{
                flex: 1, background: '#0d1b2a', color: '#e0e0e0',
                border: '1px solid #0f3460', borderRadius: 4, resize: 'none',
                fontFamily: "'Courier New', Consolas, monospace",
                fontSize: 13,
              }}
            />
            <Space>
              <Tooltip title="发送 (Enter)">
                <Button
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  onClick={sendInput}
                  disabled={!activeSession || !inputText.trim()}
                  style={{ background: '#00a86b', borderColor: '#00a86b' }}
                />
              </Tooltip>
              <Tooltip title="Ctrl+C (中断)">
                <Button
                  icon={<MinusOutlined />}
                  onClick={() => sendSignal('ctrl_c')}
                  disabled={!activeSession}
                  size="small"
                />
              </Tooltip>
              <Tooltip title="Ctrl+D (结束输入)">
                <Button
                  icon={<DeleteOutlined />}
                  onClick={() => sendSignal('ctrl_d')}
                  disabled={!activeSession}
                  size="small"
                />
              </Tooltip>
            </Space>
          </div>
        </Layout>
      </Layout>

      {/* ── 参数抽屉 ── */}
      <Drawer
        title={<Space><SettingOutlined /> 终端参数</Space>}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        width={360}
        styles={{ body: { background: '#1a1a2e', color: '#e0e0e0' } }}
      >
        <div style={{ marginBottom: 20 }}>
          <Text style={{ color: '#888', fontSize: 12, display: 'block', marginBottom: 4 }}>模式</Text>
          <Select
            value={config.mode}
            onChange={v => setConfig(prev => ({ ...prev, mode: v }))}
            options={MODE_OPTIONS}
            style={{ width: '100%' }}
          />
          <Text style={{ color: '#666', fontSize: 11, marginTop: 4, display: 'block' }}>
            {MODE_OPTIONS.find(o => o.value === config.mode)?.desc}
          </Text>
        </div>

        <div style={{ marginBottom: 20 }}>
          <Text style={{ color: '#888', fontSize: 12, display: 'block', marginBottom: 4 }}>模型</Text>
          <Select
            value={config.model}
            onChange={v => setConfig(prev => ({ ...prev, model: v }))}
            options={MODEL_OPTIONS}
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <Text style={{ color: '#888', fontSize: 12, display: 'block', marginBottom: 4 }}>
            推理深度 (Effort): {config.effort}
          </Text>
          <Select
            value={config.effort}
            onChange={v => setConfig(prev => ({ ...prev, effort: v }))}
            options={EFFORT_OPTIONS}
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <Text style={{ color: '#888', fontSize: 12, display: 'block', marginBottom: 4 }}>
            Max Turns: {config.max_turns}
          </Text>
          <Slider
            min={5}
            max={100}
            value={config.max_turns}
            onChange={v => setConfig(prev => ({ ...prev, max_turns: v }))}
            trackStyle={{ background: '#00ff88' }}
            railStyle={{ background: '#0f3460' }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <Space>
            <Switch
              checked={config.skip_permissions}
              onChange={v => setConfig(prev => ({ ...prev, skip_permissions: v }))}
            />
            <Text style={{ color: '#888', fontSize: 12 }}>
              跳过权限确认 (--dangerously-skip-permissions)
            </Text>
          </Space>
        </div>

        <Divider style={{ borderColor: '#0f3460' }} />

        <div style={{ marginBottom: 20 }}>
          <Text style={{ color: '#888', fontSize: 12, display: 'block', marginBottom: 4 }}>
            初始 Prompt (可选)
          </Text>
          <TextArea
            value={initialPrompt}
            onChange={e => setInitialPrompt(e.target.value)}
            placeholder="输入初始任务描述，留空进入交互模式..."
            rows={4}
            style={{
              background: '#0d1b2a', color: '#e0e0e0',
              border: '1px solid #0f3460',
              fontFamily: 'monospace', fontSize: 13,
            }}
          />
        </div>

        <Button
          type="primary"
          block
          icon={<PlayCircleOutlined />}
          onClick={() => { setSettingsOpen(false); startSession() }}
          loading={starting}
          style={{ background: '#00a86b', borderColor: '#00a86b', marginTop: 8 }}
        >
          启动会话
        </Button>
      </Drawer>

      {/* ── 历史记录弹窗 ── */}
      <Modal
        title={<Space><BgColorsOutlined /> 历史记录</Space>}
        open={historyVisible}
        onCancel={() => setHistoryVisible(false)}
        footer={null}
        width={800}
        styles={{ body: { maxHeight: 500, overflow: 'auto' } }}
      >
        {historyRecords.length === 0 ? (
          <Text style={{ color: '#999' }}>暂无历史记录</Text>
        ) : (
          historyRecords.map((msg, i) => (
            <div key={i} style={{
              marginBottom: 12, padding: 8, borderRadius: 4,
              background: msg.role === 'user' ? '#e6f7ff' : '#f6ffed',
            }}>
              <Tag color={msg.role === 'user' ? 'blue' : 'green'}>
                {msg.role === 'user' ? '用户' : 'Claude'}
              </Tag>
              <div style={{
                marginTop: 4, whiteSpace: 'pre-wrap', fontSize: 13, color: '#333',
                maxHeight: 200, overflow: 'auto',
              }}>
                {msg.content}
              </div>
            </div>
          ))
        )}
      </Modal>
    </Layout>
  )
}
