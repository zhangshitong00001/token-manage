import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  Layout, Button, Select, Switch, Tag, Space,
  Typography, message, Tooltip, Badge, Drawer,
  Slider, Divider, Input,
} from 'antd'
import {
  PlayCircleOutlined, StopOutlined, DeleteOutlined,
  SettingOutlined, CodeOutlined, RobotOutlined,
  ReloadOutlined, MinusOutlined, ClearOutlined,
} from '@ant-design/icons'
import { Terminal } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'
import 'xterm/css/xterm.css'
import api from '../api'

const { Text } = Typography
const { TextArea } = Input

const MODE_OPTIONS = [
  { value: 'auto', label: 'Auto', desc: '自动批准所有操作' },
  { value: 'normal', label: 'Normal', desc: '默认模式，需确认' },
  { value: 'plan', label: 'Plan', desc: '只规划不执行' },
  { value: 'acceptEdits', label: 'AcceptEdits', desc: '接受文件编辑' },
]
const MODEL_OPTIONS = [
  { value: 'sonnet', label: 'Sonnet (Claude)' },
  { value: 'opus', label: 'Opus (Claude)' },
  { value: 'haiku', label: 'Haiku (Claude)' },
  { value: 'deepseek-chat', label: 'DeepSeek Chat' },
  { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner' },
  { value: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
  { value: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
]
const EFFORT_OPTIONS = [
  { value: 'low', label: 'Low (快)' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'max', label: 'Max (深)' },
]

export default function ClaudeTerminal() {
  const [config, setConfig] = useState({
    mode: 'auto',
    model: 'deepseek-chat',
    effort: 'medium',
    max_turns: 30,
    skip_permissions: true,
    project_dir: '/root/TokenManager',
  })
  const [sessions, setSessions] = useState([])
  const [activeSession, setActiveSession] = useState(null)
  const [wsConnected, setWsConnected] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [starting, setStarting] = useState(false)

  const terminalRef = useRef(null)
  const xtermRef = useRef(null)
  const fitAddonRef = useRef(null)
  const wsRef = useRef(null)
  const inputBufferRef = useRef('')

  // ── 初始化 Xterm.js ──
  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 13,
      fontFamily: "'Courier New', 'Consolas', monospace",
      theme: {
        background: '#0d1b2a',
        foreground: '#e0e0e0',
        cursor: '#00ff88',
        selectionBackground: '#1a3a5c',
        black: '#1d1f21',
        red: '#cc6666',
        green: '#b5bd68',
        yellow: '#f0c674',
        blue: '#81a2be',
        magenta: '#b294bb',
        cyan: '#8abeb7',
        white: '#c5c8c6',
        brightBlack: '#666666',
        brightRed: '#cc6666',
        brightGreen: '#b5bd68',
        brightYellow: '#f0c674',
        brightBlue: '#81a2be',
        brightMagenta: '#b294bb',
        brightCyan: '#8abeb7',
        brightWhite: '#ffffff',
      },
      allowTransparency: true,
      convertEol: true,
      cols: 100,
      rows: 30,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    fitAddonRef.current = fitAddon

    term.open(terminalRef.current)
    fitAddon.fit()

    // 处理用户键盘输入 → 发送到 WebSocket
    term.onData((data) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'input', data }))
      }
    })

    // 显示欢迎信息
    term.writeln('\x1b[36m╔══════════════════════════════════════╗')
    term.writeln('\x1b[36m║  \x1b[32mClaude Code Terminal\x1b[36m               ║')
    term.writeln('\x1b[36m║  \x1b[33m点击「新会话」启动\x1b[36m                 ║')
    term.writeln('\x1b[36m╚══════════════════════════════════════╝\x1b[0m')
    term.writeln('')

    xtermRef.current = term

    return () => {
      term.dispose()
      xtermRef.current = null
    }
  }, [])

  // ── 适应窗口大小 ──
  useEffect(() => {
    const handleResize = () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit()
        // 通知后端 PTY 大小变化
        if (xtermRef.current && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          const dims = fitAddonRef.current.proposeDimensions()
          if (dims) {
            wsRef.current.send(JSON.stringify({
              type: 'resize',
              cols: dims.cols,
              rows: dims.rows,
            }))
          }
        }
      }
    }
    window.addEventListener('resize', handleResize)
    setTimeout(handleResize, 100)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // ── 获取会话列表 ──
  const fetchSessions = useCallback(async () => {
    try {
      const token = localStorage.getItem('admin_token')
      if (!token) return
      const res = await api.get('/claude-terminal/sessions')
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
      const term = xtermRef.current
      if (term) {
        term.writeln('\x1b[32m🟢 WebSocket 已连接\x1b[0m')
        // 通知终端大小
        if (fitAddonRef.current) {
          const dims = fitAddonRef.current.proposeDimensions()
          if (dims) {
            ws.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }))
          }
        }
      }
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        const term = xtermRef.current
        if (!term) return

        switch (msg.type) {
          case 'output':
            term.write(msg.data)
            break
          case 'status':
            if (msg.state === 'stopped') {
              term.writeln('\r\n\x1b[33m⏹ 会话已结束\x1b[0m')
              fetchSessions()
            }
            break
          case 'error':
            term.writeln(`\r\n\x1b[31m❌ ${msg.message}\x1b[0m`)
            break
        }
      } catch {}
    }

    ws.onclose = () => {
      setWsConnected(false)
      const term = xtermRef.current
      if (term) {
        term.writeln('\r\n\x1b[31m🔴 WebSocket 已断开\x1b[0m')
      }
      fetchSessions()
    }

    ws.onerror = () => {
      const term = xtermRef.current
      if (term) {
        term.writeln('\r\n\x1b[31m❌ WebSocket 连接错误\x1b[0m')
      }
    }

    wsRef.current = ws
  }, [fetchSessions])

  // ── 启动新会话 ──
  const startSession = async () => {
    if (starting) return
    setStarting(true)
    try {
      const token = localStorage.getItem('admin_token')
      if (!token) { message.error('请先登录'); return }

      const res = await fetch('/api/claude-terminal/session/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ ...config, initial_prompt: '' }),
      })
      const data = await res.json()
      if (data.session_id) {
        const term = xtermRef.current
        if (term) {
          term.clear()
          term.writeln(`\x1b[36m🚀 会话 ${data.session_id.slice(-8)} 已启动\x1b[0m`)
          term.writeln(`\x1b[90m模式: ${config.mode} | 模型: ${config.model} | Effort: ${config.effort}\x1b[0m`)
          term.writeln('\x1b[90m交互模式 - 在终端中直接输入\x1b[0m')
          term.writeln('')
        }
        setActiveSession(data.session_id)
        connectWS(data.session_id)
        fetchSessions()
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
    } catch {}
  }

  // ── 发送信号 ──
  const sendSignal = (sig) => {
    if (!activeSession || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    wsRef.current.send(JSON.stringify({ type: 'signal', signal: sig }))
  }

  // ── 清理 ──
  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close()
    }
  }, [])

  return (
    <Layout style={{ height: 'calc(100vh - 100px)', background: '#0d1b2a', borderRadius: 8, overflow: 'hidden' }}>
      {/* ── 工具栏 ── */}
      <div style={{
        background: '#0a1628', padding: '6px 12px',
        display: 'flex', alignItems: 'center', gap: 6,
        borderBottom: '1px solid #1a3a5c',
      }}>
        <CodeOutlined style={{ color: '#00ff88', fontSize: 16 }} />
        <Text style={{ color: '#e0e0e0', fontWeight: 600, fontSize: 13, marginRight: 8 }}>
          Claude Code Terminal
        </Text>

        <Badge status={wsConnected ? 'success' : 'default'} />
        <Text style={{ color: wsConnected ? '#00ff88' : '#666', fontSize: 11, marginRight: 8 }}>
          {wsConnected ? '已连接' : '未连接'}
        </Text>

        <Button size="small" type="primary" icon={<PlayCircleOutlined />}
          onClick={startSession} loading={starting}
          style={{ background: '#00a86b', borderColor: '#00a86b', height: 26, fontSize: 12 }}>
          新会话
        </Button>

        <Button size="small" icon={<StopOutlined />}
          onClick={stopSession} disabled={!activeSession}
          danger style={{ height: 26, fontSize: 12 }}>
          停止
        </Button>

        <Button size="small" icon={<DeleteOutlined />}
          onClick={() => xtermRef.current?.clear()}
          style={{ height: 26, fontSize: 12 }}>
          清屏
        </Button>

        <div style={{ flex: 1 }} />

        <Button size="small" icon={<SettingOutlined />}
          onClick={() => setSettingsOpen(true)}
          type={settingsOpen ? 'primary' : 'default'}
          style={{ height: 26, fontSize: 12 }}>
          参数
        </Button>
      </div>

      <div style={{ display: 'flex', flex: 1 }}>
        {/* ── 会话列表侧栏 ── */}
        <div style={{
          width: 200, background: '#0a1628',
          borderRight: '1px solid #1a3a5c',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: '6px 10px', color: '#666', fontSize: 11, borderBottom: '1px solid #1a3a5c' }}>
            会话 ({sessions.length})
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: 4 }}>
            {sessions.length === 0 ? (
              <div style={{ padding: 12, textAlign: 'center', color: '#333', fontSize: 11 }}>
                暂无会话
              </div>
            ) : (
              sessions.map(s => (
                <div key={s.session_id}
                  onClick={() => {
                    setActiveSession(s.session_id)
                    xtermRef.current?.clear()
                    connectWS(s.session_id)
                  }}
                  style={{
                    padding: '6px 10px', cursor: 'pointer', borderRadius: 3, marginBottom: 1,
                    background: activeSession === s.session_id ? '#0f3460' : 'transparent',
                    borderLeft: activeSession === s.session_id ? '2px solid #00ff88' : '2px solid transparent',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Badge status={s.status === 'running' ? 'processing' : 'default'} />
                    <Text style={{ color: '#aaa', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.session_id.slice(-8)}
                    </Text>
                    <Tag color={s.status === 'running' ? 'green' : 'default'} style={{ fontSize: 9, lineHeight: '14px', padding: '0 3px' }}>
                      {s.mode}
                    </Tag>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Xterm.js 终端 ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div ref={terminalRef} style={{ flex: 1, padding: 4 }} />
        </div>
      </div>

      {/* ── Ctrl 快捷按钮 ── */}
      <div style={{
        background: '#0a1628', padding: '4px 12px',
        borderTop: '1px solid #1a3a5c',
        display: 'flex', gap: 6, alignItems: 'center',
      }}>
        <Text style={{ color: '#666', fontSize: 11 }}>Ctrl: </Text>
        <Tooltip title="Ctrl+C (中断)">
          <Button size="small" icon={<MinusOutlined />}
            onClick={() => sendSignal('ctrl_c')} disabled={!activeSession}
            style={{ height: 24, fontSize: 11 }} />
        </Tooltip>
        <Tooltip title="Ctrl+D (结束输入)">
          <Button size="small" icon={<DeleteOutlined />}
            onClick={() => sendSignal('ctrl_d')} disabled={!activeSession}
            style={{ height: 24, fontSize: 11 }} />
        </Tooltip>
        <Tooltip title="Kill (强制停止)">
          <Button size="small" icon={<StopOutlined />}
            onClick={() => sendSignal('kill')} disabled={!activeSession}
            style={{ height: 24, fontSize: 11 }} danger />
        </Tooltip>
        <Text style={{ color: '#444', fontSize: 10, marginLeft: 8 }}>
          直接在终端中打字输入，支持完整键盘交互（Tab补全、方向键等）
        </Text>
      </div>

      {/* ── 参数抽屉 ── */}
      <Drawer
        title={<Space><SettingOutlined /> 终端参数</Space>}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        width={340}
        styles={{ body: { background: '#0d1b2a', color: '#e0e0e0' } }}
      >
        <div style={{ marginBottom: 16 }}>
          <Text style={{ color: '#888', fontSize: 12, display: 'block', marginBottom: 4 }}>模式</Text>
          <Select value={config.mode} onChange={v => setConfig(p => ({ ...p, mode: v }))}
            options={MODE_OPTIONS} style={{ width: '100%' }} />
          <Text style={{ color: '#555', fontSize: 10, marginTop: 2, display: 'block' }}>
            {MODE_OPTIONS.find(o => o.value === config.mode)?.desc}
          </Text>
        </div>
        <div style={{ marginBottom: 16 }}>
          <Text style={{ color: '#888', fontSize: 12, display: 'block', marginBottom: 4 }}>模型</Text>
          <Select value={config.model} onChange={v => setConfig(p => ({ ...p, model: v }))}
            options={MODEL_OPTIONS} style={{ width: '100%' }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <Text style={{ color: '#888', fontSize: 12, display: 'block', marginBottom: 4 }}>推理深度: {config.effort}</Text>
          <Select value={config.effort} onChange={v => setConfig(p => ({ ...p, effort: v }))}
            options={EFFORT_OPTIONS} style={{ width: '100%' }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <Text style={{ color: '#888', fontSize: 12, display: 'block', marginBottom: 4 }}>Max Turns: {config.max_turns}</Text>
          <Slider min={5} max={100} value={config.max_turns}
            onChange={v => setConfig(p => ({ ...p, max_turns: v }))}
            trackStyle={{ background: '#00ff88' }} railStyle={{ background: '#0f3460' }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <Space>
            <Switch checked={config.skip_permissions} onChange={v => setConfig(p => ({ ...p, skip_permissions: v }))} />
            <Text style={{ color: '#888', fontSize: 12 }}>跳过权限确认</Text>
          </Space>
        </div>
        <Divider style={{ borderColor: '#0f3460' }} />
        <Button type="primary" block icon={<PlayCircleOutlined />}
          onClick={() => { setSettingsOpen(false); startSession() }}
          loading={starting}
          style={{ background: '#00a86b', borderColor: '#00a86b' }}>
          启动会话
        </Button>
      </Drawer>
    </Layout>
  )
}
