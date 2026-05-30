import React, { useState, useEffect } from 'react'
import { Row, Col, Card, Spin, Table, Tag, Button, Modal, Descriptions, message, Tooltip, Statistic, Tabs } from 'antd'
import {
  WalletOutlined, RiseOutlined, ReloadOutlined,
  DollarOutlined, FileTextOutlined,
  EyeOutlined, EyeInvisibleOutlined, CopyOutlined,
  WarningOutlined, UserOutlined, ThunderboltOutlined, MessageOutlined,
} from '@ant-design/icons'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  Legend, ResponsiveContainer,
} from 'recharts'
import { DatePicker } from 'antd'
import dayjs from 'dayjs'
import api from '../api'

// ===== 普通用户仪表盘 =====
function UserDashboard() {
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState(null)
  const [usage, setUsage] = useState(null)
  const [records, setRecords] = useState([])
  const [conversations, setConversations] = useState([])
  const [convTotal, setConvTotal] = useState(0)
  const [convPage, setConvPage] = useState(1)
  const [activeTab, setActiveTab] = useState('overview')

  const loadData = () => {
    setLoading(true)
    Promise.all([
      api.get('/user/my-usage'),
      api.get('/user/profile'),
      api.get('/admin/usage/list?page_size=10'),
      api.get('/user/my-conversations?page=1&page_size=20'),
    ]).then(([u, p, r, c]) => {
      setUsage(u)
      setProfile(p)
      setRecords(r.items || [])
      setConversations(c.items || [])
      setConvTotal(c.total || 0)
    }).catch(console.error).finally(() => setLoading(false))
  }

  const loadConversations = (page) => {
    api.get(`/user/my-conversations?page=${page}&page_size=20`).then(c => {
      setConversations(c.items || [])
      setConvTotal(c.total || 0)
      setConvPage(page)
    }).catch(console.error)
  }

  useEffect(() => { loadData() }, [])

  if (loading) return <Spin size="large" style={{ display: 'block', textAlign: 'center', marginTop: 80 }} />

  const usageColumns = [
    { title: '时间', dataIndex: 'usage_time', render: (t) => dayjs(t).format('MM-DD HH:mm') },
    { title: '输入Token', dataIndex: 'input_tokens', render: (v) => (v || 0).toLocaleString() },
    { title: '输出Token', dataIndex: 'output_tokens', render: (v) => (v || 0).toLocaleString() },
    { title: '消耗', dataIndex: 'total_cost', render: (v) => <Tag color="blue">{(v || 0).toLocaleString()}</Tag> },
  ]

  const convColumns = [
    {
      title: '来源', dataIndex: 'source', width: 80, align: 'center',
      render: (src) => src === 'workspace'
        ? <Tag color="purple" style={{ fontSize: 10 }}>数据</Tag>
        : <Tag color="blue" style={{ fontSize: 10 }}>对话</Tag>,
    },
    {
      title: '时间', dataIndex: 'time', width: 130,
      render: (t) => dayjs(t).format('MM-DD HH:mm'),
    },
    {
      title: '对话内容', dataIndex: 'user_message', ellipsis: true,
      render: (msg) => (
        <span style={{ color: msg ? '#333' : '#bbb', fontStyle: msg ? 'normal' : 'italic' }}>
          {msg || '(暂无记录)'}
        </span>
      ),
    },
    {
      title: '调用次数', dataIndex: 'call_count', width: 80, align: 'center',
      render: (v) => <Tag>{v}</Tag>,
    },
    {
      title: '输入', dataIndex: 'input_tokens', width: 90, align: 'right',
      render: (v) => <span style={{ color: '#1677ff' }}>{(v || 0).toLocaleString()}</span>,
    },
    {
      title: '输出', dataIndex: 'output_tokens', width: 90, align: 'right',
      render: (v) => <span style={{ color: '#52c41a' }}>{(v || 0).toLocaleString()}</span>,
    },
    {
      title: '消耗 Token', dataIndex: 'total_cost', width: 110, align: 'right',
      render: (v) => <Tag color="blue" style={{ fontWeight: 600 }}>{(v || 0).toLocaleString()}</Tag>,
    },
  ]

  const tabItems = [
    {
      key: 'overview',
      label: <span><WalletOutlined /> 总览</span>,
      children: (
        <>
          {/* 余额卡片 */}
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            <Col xs={24} lg={8}>
              <Card style={{
                borderRadius: 12, height: '100%',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                border: 'none', color: '#fff',
              }}>
                <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 8 }}>
                  <WalletOutlined style={{ marginRight: 4 }} />我的 Token 余额
                </div>
                <div style={{ fontSize: 32, fontWeight: 700 }}>
                  {(usage?.token_balance || 0).toLocaleString()}
                </div>
                <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>Token</div>
              </Card>
            </Col>
            <Col xs={12} lg={8}>
              <Card style={{ borderRadius: 12, height: '100%' }}>
                <Statistic
                  title={<span><ThunderboltOutlined style={{ marginRight: 4 }} />今日消耗</span>}
                  value={usage?.today?.total_cost || 0}
                  suffix="Token"
                  valueStyle={{ color: '#fa8c16', fontWeight: 700 }}
                />
                <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
                  输入 {usage?.today?.input_tokens?.toLocaleString()} / 输出 {usage?.today?.output_tokens?.toLocaleString()}
                </div>
              </Card>
            </Col>
            <Col xs={12} lg={8}>
              <Card style={{ borderRadius: 12, height: '100%' }}>
                <Statistic
                  title={<span><FileTextOutlined style={{ marginRight: 4 }} />本月累计</span>}
                  value={usage?.month?.total_cost || 0}
                  suffix="Token"
                  valueStyle={{ color: '#1677ff', fontWeight: 700 }}
                />
                <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
                  调用 {usage?.month?.call_count} 次
                </div>
              </Card>
            </Col>
          </Row>

          {/* 微简报 */}
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            <Col xs={8}>
              <Card size="small" style={{ borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#999' }}>今日调用</div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>{usage?.today?.call_count || 0}</div>
              </Card>
            </Col>
            <Col xs={8}>
              <Card size="small" style={{ borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#999' }}>今日输入</div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>{(usage?.today?.input_tokens || 0).toLocaleString()}</div>
              </Card>
            </Col>
            <Col xs={8}>
              <Card size="small" style={{ borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#999' }}>今日输出</div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>{(usage?.today?.output_tokens || 0).toLocaleString()}</div>
              </Card>
            </Col>
          </Row>

          {/* 消耗记录 */}
          <Card title="📋 我的消耗记录" style={{ borderRadius: 12 }}>
            <Table
              dataSource={records}
              columns={usageColumns}
              rowKey="id"
              pagination={false}
              size="small"
              locale={{ emptyText: '暂无消耗记录' }}
            />
          </Card>
        </>
      ),
    },
    {
      key: 'conversations',
      label: <span><MessageOutlined /> 我的对话 ({convTotal})</span>,
      children: (
        <Card style={{ borderRadius: 12 }}>
          <Table
            dataSource={conversations}
            columns={convColumns}
            rowKey="request_id"
            size="small"
            pagination={{
              current: convPage,
              pageSize: 20,
              total: convTotal,
              onChange: loadConversations,
              showSizeChanger: false,
            }}
            locale={{ emptyText: '暂无对话记录。在 AI 对话中提问后，每次会话的消耗会显示在这里。' }}
          />
        </Card>
      ),
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>
          👋 你好，{profile?.nickname || profile?.email || '用户'}
        </h3>
        <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>刷新</Button>
      </div>
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
    </div>
  )
}

// ===== 管理员仪表盘（保持不变） =====
function AdminDashboard() {
  const [loading, setLoading] = useState(true)
  const [usageData, setUsageData] = useState([])
  const [summary, setSummary] = useState(null)
  const [usage, setUsage] = useState(null)
  const [stats, setStats] = useState(null)
  const [apiKeys, setApiKeys] = useState([])
  const [revealedKeys, setRevealedKeys] = useState({})
  const [revealing, setRevealing] = useState({})
  const [modalKey, setModalKey] = useState(null)
  const [modalVisible, setModalVisible] = useState(false)
  const [dateRange, setDateRange] = useState([null, null])

  const loadData = () => {
    setLoading(true)
    Promise.all([
      api.get('/admin/usage/list?page_size=10'),
      api.get('/admin/deepseek/summary'),
      api.get('/admin/deepseek/usage'),
      api.get('/admin/statistics'),
      api.get('/admin/deepseek/api-keys'),
    ]).then(([u, dss, du, s, k]) => {
      setUsageData(u.items)
      setSummary(dss?.data || dss)
      setUsage(du?.data || du)
      setStats(s)
      setApiKeys(k?.items || k?.keys || [])
    }).catch(console.error).finally(() => setLoading(false))
  }

  useEffect(() => { loadData() }, [])

  const formatNum = (n) => {
    if (!n || isNaN(n)) return '0'
    if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿'
    if (n >= 10000) return (n / 10000).toFixed(1) + '万'
    return n.toLocaleString()
  }
  const formatBalance = (b) => {
    const n = parseFloat(b)
    if (isNaN(n) || Math.abs(n) < 0.001) return '0.00'
    return n.toFixed(2)
  }

  const handleReveal = async (trackingId) => {
    if (revealedKeys[trackingId]) {
      setRevealedKeys(prev => ({ ...prev, [trackingId]: false }))
      return
    }
    setRevealing(prev => ({ ...prev, [trackingId]: true }))
    try {
      const res = await api.post('/admin/deepseek/api-keys/reveal', { tracking_id: trackingId })
      if (res?.success && res?.key) setRevealedKeys(prev => ({ ...prev, [trackingId]: res.key }))
    } catch (e) {
      message.error('获取完整 Key 失败')
    } finally { setRevealing(prev => ({ ...prev, [trackingId]: false })) }
  }
  const handleCopy = (text) => {
    navigator.clipboard.writeText(text).then(() => message.success('已复制'))
  }

  const wallets = summary?.normal_wallets || []
  const cnyWallet = wallets.find(w => w.currency === 'CNY') || {}
  const usdWallet = wallets.find(w => w.currency === 'USD') || {}
  const monthlyCosts = summary?.monthly_costs || []
  const cnyCost = monthlyCosts.find(c => c.currency === 'CNY') || {}
  const usdCost = monthlyCosts.find(c => c.currency === 'USD') || {}

  const amountData = usage?.amount?.data?.biz_data
  const days = amountData?.days || []
  const allDays = days.filter(d => d.data?.some(m => m.usage?.some(u => parseInt(u.amount) > 0)))
    .map(d => {
      const v4pro = d.data?.find(x => x.model === 'deepseek-v4-pro')
      const v4flash = d.data?.find(x => x.model === 'deepseek-v4-flash')
      const getTotal = (md) => {
        if (!md) return 0
        return (md.usage || []).filter(u => u.type !== 'REQUEST').reduce((s, u) => s + parseInt(u.amount || '0'), 0)
      }
      const getRequests = (md) => {
        if (!md) return 0
        const req = md.usage?.find(u => u.type === 'REQUEST')
        return req ? parseInt(req.amount || '0') : 0
      }
      return {
        date: d.date, shortDate: d.date.slice(5),
        v4pro: getTotal(v4pro), v4flash: getTotal(v4flash),
        requests: getRequests(v4pro) + getRequests(v4flash),
      }
    }).sort((a, b) => b.date.localeCompare(a.date))

  let filtered = allDays
  if (dateRange[0] && dateRange[1]) {
    const start = dateRange[0].format('YYYY-MM-DD')
    const end = dateRange[1].format('YYYY-MM-DD')
    filtered = allDays.filter(d => d.date >= start && d.date <= end)
  }
  const chartData = [...filtered].reverse()

  const formatShort = (v) => {
    if (v >= 100000000) return (v / 100000000).toFixed(1) + '亿'
    if (v >= 10000) return (v / 10000).toFixed(1) + '万'
    return v.toLocaleString()
  }

  const ChartTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    const day = chartData.find(d => d.shortDate === label)
    if (!day) return null
    return (
      <div style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 8, padding: '10px 14px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: 13 }}>
        <div style={{ fontWeight: 600, marginBottom: 6, color: '#333' }}>{day.date}</div>
        {payload.map((p, i) => (
          <div key={i} style={{ color: p.color, marginBottom: 2 }}>{p.name}: <b>{formatShort(p.value)}</b></div>
        ))}
        <div style={{ marginTop: 4, color: '#666' }}>请求数: <b>{day.requests.toLocaleString()}</b></div>
      </div>
    )
  }

  const keyColumns = [
    {
      title: '名称', dataIndex: 'name',
      render: (t) => <span style={{ fontWeight: 500 }}>{t || '未命名'}</span>,
    },
    {
      title: 'API Key', dataIndex: 'masked_key',
      render: (text, record) => {
        const fullKey = revealedKeys[record.tracking_id]
        const isRevealing = revealing[record.tracking_id]
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'monospace', fontSize: 13 }}>
            <span style={{ background: '#f5f5f5', padding: '4px 10px', borderRadius: 6, color: fullKey ? '#333' : '#999' }}>
              {fullKey || text || 'sk-...'}
            </span>
            <Tooltip title={fullKey ? '隐藏' : '显示完整 Key'}>
              <Button type="text" size="small" icon={fullKey ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                loading={isRevealing} onClick={() => handleReveal(record.tracking_id)} />
            </Tooltip>
            {fullKey && (
              <Tooltip title="复制">
                <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => handleCopy(fullKey)} />
              </Tooltip>
            )}
          </div>
        )
      },
    },
    {
      title: '最近使用', dataIndex: 'last_use',
      render: (ts) => ts ? new Date(ts * 1000).toLocaleString('zh-CN') : '从未使用',
    },
    {
      title: '操作', render: (_, record) => (
        <Button type="link" size="small" onClick={() => { setModalKey(record); setModalVisible(true) }}>详情</Button>
      ),
    },
  ]

  const usageColumns = [
    { title: '时间', dataIndex: 'usage_time', render: (t) => dayjs(t).format('YYYY-MM-DD HH:mm:ss') },
    { title: '用户ID', dataIndex: 'user_id' },
    { title: 'Agent', dataIndex: 'agent_name' },
    { title: '输入Token', dataIndex: 'input_tokens' },
    { title: '输出Token', dataIndex: 'output_tokens' },
    { title: '消耗', dataIndex: 'total_cost', render: (v) => <Tag color="blue">{v.toLocaleString()}</Tag> },
  ]

  if (loading) return <Spin size="large" style={{ display: 'block', textAlign: 'center', marginTop: 80 }} />

  const typeLabels = { PROMPT_TOKEN: '提示 Token', PROMPT_CACHE_HIT_TOKEN: '缓存命中', PROMPT_CACHE_MISS_TOKEN: '缓存未命中', RESPONSE_TOKEN: '回复 Token', REQUEST: '请求次数' }
  const costTypeLabels = { PROMPT_TOKEN: '提示', PROMPT_CACHE_HIT_TOKEN: '缓存命中', PROMPT_CACHE_MISS_TOKEN: '缓存未命中', RESPONSE_TOKEN: '回复', REQUEST: '请求' }
  const amountDataInner = usage?.amount?.data?.biz_data
  const costData = usage?.cost?.data?.biz_data
  const costArr = Array.isArray(costData) ? costData : []

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>刷新数据</Button>
      </div>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} lg={6}>
          <Card style={{ borderRadius: 12, height: '100%', background: 'linear-gradient(135deg, #52c41a 0%, #237804 100%)', color: '#fff', border: 'none' }}>
            <div style={{ fontSize: 11, opacity: 0.85, marginBottom: 6 }}>今日充值成功</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>¥{(stats?.today_total_recharge || 0).toFixed(2)}</div>
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card style={{ borderRadius: 12, height: '100%', background: 'linear-gradient(135deg, #1677ff 0%, #0958d9 100%)', color: '#fff', border: 'none' }}>
            <div style={{ fontSize: 11, opacity: 0.85, marginBottom: 6 }}>历史充值总额</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>¥{(stats?.total_recharge_amount || 0).toFixed(2)}</div>
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card style={{ borderRadius: 12, height: '100%', background: 'linear-gradient(135deg, #fa8c16 0%, #d46b08 100%)', color: '#fff', border: 'none' }}>
            <div style={{ fontSize: 11, opacity: 0.85, marginBottom: 6 }}>总用户</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{stats?.total_users || 0}</div>
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card style={{ borderRadius: 12, height: '100%', background: 'linear-gradient(135deg, #eb2f96 0%, #c41d7f 100%)', color: '#fff', border: 'none' }}>
            <div style={{ fontSize: 11, opacity: 0.85, marginBottom: 6 }}>活跃用户</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{stats?.active_users || 0}</div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={10}>
          <Card style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', borderRadius: 12, border: 'none', height: '100%' }}>
            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, marginBottom: 10 }}>
              <DollarOutlined style={{ marginRight: 4 }} />DeepSeek 余额
            </div>
            <div style={{ fontSize: 30, fontWeight: 700, color: '#fff', marginBottom: 6 }}>
              ¥{formatBalance(cnyWallet.balance)}
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11 }}>
                <span style={{ opacity: 0.6 }}>Token 估值</span>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginTop: 1 }}>{formatNum(cnyWallet.token_estimation)}</div>
              </div>
              <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11 }}>
                <span style={{ opacity: 0.6 }}>本月费</span>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginTop: 1 }}>¥{formatBalance(cnyCost.amount)}</div>
              </div>
              <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11 }}>
                <span style={{ opacity: 0.6 }}>USD</span>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginTop: 1 }}>${formatBalance(usdWallet.balance)}</div>
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={12} lg={7}>
          <Card style={{ borderRadius: 12, height: '100%' }}>
            <div style={{ color: '#999', fontSize: 11, marginBottom: 6 }}><FileTextOutlined style={{ marginRight: 4 }} />本月 Token</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#667eea' }}>{formatNum(summary?.monthly_token_usage || 0)}</div>
          </Card>
        </Col>
        <Col xs={12} lg={7}>
          <Card style={{ borderRadius: 12, height: '100%' }}>
            <div style={{ color: '#999', fontSize: 11, marginBottom: 6 }}><RiseOutlined style={{ marginRight: 4 }} />可用 Token</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#52c41a' }}>{formatNum(summary?.total_available_token_estimation || 0)}</div>
          </Card>
        </Col>
      </Row>

      <Card title="🔐 API 密钥管理" style={{ borderRadius: 12, marginBottom: 16 }}>
        <Table dataSource={apiKeys} columns={keyColumns} rowKey="tracking_id" pagination={false}
          size="small" locale={{ emptyText: '暂无 API Key' }} />
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="📊 本月 Token 用量（按模型）" style={{ borderRadius: 12 }}>
            {(() => {
              const totals = amountDataInner?.total || []
              if (!totals.length) return <div style={{ color: '#999', textAlign: 'center', padding: 20 }}>暂无数据</div>
              return (
                <Table dataSource={totals} rowKey="model" pagination={false} size="small"
                  columns={[
                    { title: '模型', dataIndex: 'model', render: (t) => <b>{t}</b> },
                    ...(totals[0]?.usage || []).map(u => ({
                      title: typeLabels[u.type] || u.type, key: u.type,
                      render: (_, record) => {
                        const val = record.usage?.find(x => x.type === u.type)
                        return val ? formatNum(val.amount) : '0'
                      },
                    })),
                  ]}
                />
              )
            })()}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="💰 本月费用（按模型）" style={{ borderRadius: 12 }}>
            {costArr.length ? costArr.map((currData, idx) => {
              const totals = currData?.total || []
              const currency = currData?.currency || 'CNY'
              return (
                <div key={idx} style={{ marginBottom: idx < costArr.length - 1 ? 16 : 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#667eea' }}>
                    {currency === 'CNY' ? '🇨🇳 CNY' : '🇺🇸 USD'}
                  </div>
                  <Table dataSource={totals} rowKey="model" pagination={false} size="small"
                    columns={[
                      { title: '模型', dataIndex: 'model', render: (t) => <b>{t}</b> },
                      ...(totals[0]?.usage?.filter(u => parseFloat(u.amount) > 0) || []).map(u => ({
                        title: costTypeLabels[u.type] || u.type, key: u.type,
                        render: (_, record) => {
                          const val = record.usage?.find(x => x.type === u.type)
                          const num = parseFloat(val?.amount || '0')
                          return num === 0 ? '-' : (currency === 'CNY' ? `¥${num.toFixed(4)}` : `$${num.toFixed(4)}`)
                        },
                      })),
                      {
                        title: '合计', key: 'total',
                        render: (_, record) => {
                          const total = (record.usage || []).filter(u => u.type !== 'REQUEST').reduce((s, u) => s + parseFloat(u.amount || '0'), 0)
                          return total === 0 ? '-' : <b>{currency === 'CNY' ? `¥${total.toFixed(4)}` : `$${total.toFixed(4)}`}</b>
                        },
                      },
                    ]}
                  />
                </div>
              )
            }) : <div style={{ color: '#999', textAlign: 'center', padding: 20 }}>暂无数据</div>}
          </Card>
        </Col>
      </Row>

      <Card title="📈 每日 Token 用量趋势" style={{ borderRadius: 12, marginBottom: 16 }}
        extra={
          <DatePicker.RangePicker size="small" placeholder={['起始日期', '结束日期']}
            value={dateRange} onChange={(dates) => setDateRange(dates || [null, null])}
            allowClear style={{ width: 240 }} />
        }
      >
        {chartData.length ? (
          <div>
            <div style={{ marginBottom: 8, fontSize: 12, color: '#999' }}>
              共 {filtered.length} 天数据
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} barGap={4} barCategoryGap={8}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="shortDate" tick={{ fontSize: 11, fill: '#888' }} axisLine={{ stroke: '#e8e8e8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#888' }} axisLine={{ stroke: '#e8e8e8' }} tickFormatter={formatShort} />
                <ReTooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(102, 126, 234, 0.08)' }} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Bar dataKey="v4pro" name="V4-Pro" fill="#667eea" radius={[4, 4, 0, 0]} maxBarSize={36} />
                <Bar dataKey="v4flash" name="V4-Flash" fill="#52c41a" radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : <div style={{ color: '#999', textAlign: 'center', padding: 20 }}>暂无数据</div>}
      </Card>

      <Card title="最新消耗记录" style={{ borderRadius: 12, marginBottom: 16 }}>
        <Table dataSource={usageData} columns={usageColumns} rowKey="id" pagination={false} size="small" />
      </Card>

      <Modal title="API Key 详情" open={modalVisible} onCancel={() => setModalVisible(false)} footer={null} width={480}>
        {modalKey && (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="名称">{modalKey.name || '未命名'}</Descriptions.Item>
            <Descriptions.Item label="Key (脱敏)">{modalKey.masked_key}</Descriptions.Item>
            <Descriptions.Item label="创建时间">{new Date(modalKey.created_at * 1000).toLocaleString('zh-CN')}</Descriptions.Item>
            <Descriptions.Item label="最近使用">{modalKey.last_use ? new Date(modalKey.last_use * 1000).toLocaleString('zh-CN') : '从未使用'}</Descriptions.Item>
            <Descriptions.Item label="Tracking ID"><code style={{ fontSize: 12 }}>{modalKey.tracking_id}</code></Descriptions.Item>
          </Descriptions>
        )}
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Button type="primary" icon={<EyeOutlined />} onClick={() => handleReveal(modalKey?.tracking_id)}
            loading={revealing[modalKey?.tracking_id]}>查看完整 Key</Button>
          {revealedKeys[modalKey?.tracking_id] && (
            <Button style={{ marginLeft: 8 }} icon={<CopyOutlined />} onClick={() => handleCopy(revealedKeys[modalKey?.tracking_id])}>复制</Button>
          )}
        </div>
        {revealedKeys[modalKey?.tracking_id] && (
          <div style={{ marginTop: 12, padding: 12, background: '#fffbe6', borderRadius: 8, border: '1px solid #ffe58f', fontSize: 12, color: '#ad6800' }}>
            <WarningOutlined style={{ marginRight: 6 }} />注意：API Key 是敏感信息，请勿泄露
          </div>
        )}
      </Modal>
    </div>
  )
}

// ===== 主入口：根据角色选择仪表盘 =====
export default function Dashboard() {
  const userStr = localStorage.getItem('admin_user')
  const user = userStr ? JSON.parse(userStr) : null
  const isAdmin = user?.role === 'admin'

  return isAdmin ? <AdminDashboard /> : <UserDashboard />
}
