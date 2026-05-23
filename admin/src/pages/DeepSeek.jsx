import React, { useState, useEffect, useMemo } from 'react'
import { Row, Col, Card, Spin, Table, Tag, Button, Modal, Descriptions, message, Progress, Tooltip, DatePicker } from 'antd'
import {
  KeyOutlined, EyeOutlined, EyeInvisibleOutlined,
  DollarOutlined, FileTextOutlined, ShoppingCartOutlined,
  RiseOutlined, ReloadOutlined, CopyOutlined,
  CheckCircleOutlined, CloseCircleOutlined, WarningOutlined,
  BarChartOutlined,
} from '@ant-design/icons'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  Legend, ResponsiveContainer, Cell,
} from 'recharts'
import dayjs from 'dayjs'
import api from '../api'

export default function DeepSeek() {
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState(null)
  const [apiKeys, setApiKeys] = useState([])
  const [usage, setUsage] = useState(null)
  const [revealedKeys, setRevealedKeys] = useState({})
  const [revealing, setRevealing] = useState({})
  const [modalKey, setModalKey] = useState(null)
  const [modalVisible, setModalVisible] = useState(false)
  const [dateRange, setDateRange] = useState([null, null])

  const loadData = async () => {
    setLoading(true)
    try {
      const [s, k, u] = await Promise.all([
        api.get('/admin/deepseek/summary'),
        api.get('/admin/deepseek/api-keys'),
        api.get('/admin/deepseek/usage'),
      ])
      setSummary(s?.data || s)
      setApiKeys(k?.items || k?.keys || [])
      setUsage(u?.data || u)
    } catch (e) {
      message.error('加载数据失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  // 揭示 API Key
  const handleReveal = async (trackingId) => {
    if (revealedKeys[trackingId]) {
      setRevealedKeys(prev => ({ ...prev, [trackingId]: false }))
      return
    }
    setRevealing(prev => ({ ...prev, [trackingId]: true }))
    try {
      const res = await api.post('/admin/deepseek/api-keys/reveal', { tracking_id: trackingId })
      if (res?.success && res?.key) {
        setRevealedKeys(prev => ({ ...prev, [trackingId]: res.key }))
      }
    } catch (e) {
      message.error('获取完整 Key 失败')
    } finally {
      setRevealing(prev => ({ ...prev, [trackingId]: false })),
      {}
    }
  }

  // 复制到剪贴板
  const handleCopy = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      message.success('已复制到剪贴板')
    })
  }

  // 展示完整 Key 弹窗
  const showKeyDetail = (keyData) => {
    setModalKey(keyData)
    setModalVisible(true)
  }

  // 格式化余额
  const formatBalance = (balance) => {
    const num = parseFloat(balance)
    if (isNaN(num)) return '0.00'
    if (Math.abs(num) < 0.001) return '0.00'
    return num.toFixed(2)
  }

  // 格式化大数字
  const formatBigNumber = (num) => {
    const n = parseInt(num)
    if (isNaN(n)) return '0'
    if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿'
    if (n >= 10000) return (n / 10000).toFixed(1) + '万'
    return n.toLocaleString()
  }

  // API Keys 表格列
  const keyColumns = [
    {
      title: '名称', dataIndex: 'name', key: 'name',
      render: (text) => <span style={{ fontWeight: 500 }}>{text || '未命名'}</span>,
    },
    {
      title: 'API Key', dataIndex: 'masked_key', key: 'masked_key',
      render: (text, record) => {
        const fullKey = revealedKeys[record.tracking_id]
        const isRevealing = revealing[record.tracking_id]
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'monospace', fontSize: 13 }}>
            <span style={{
              background: '#f5f5f5', padding: '4px 10px', borderRadius: 6,
              color: fullKey ? '#333' : '#999', letterSpacing: fullKey ? 0 : 1,
            }}>
              {fullKey || text || 'sk-...'}
            </span>
            <Tooltip title={fullKey ? '隐藏' : '显示完整 Key'}>
              <Button
                type="text" size="small"
                icon={fullKey ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                loading={isRevealing}
                onClick={() => handleReveal(record.tracking_id)}
              />
            </Tooltip>
            {fullKey && (
              <Tooltip title="复制">
                <Button type="text" size="small" icon={<CopyOutlined />}
                  onClick={() => handleCopy(fullKey)} />
              </Tooltip>
            )}
          </div>
        )
      },
    },
    {
      title: '最近使用', dataIndex: 'last_use', key: 'last_use',
      render: (ts) => ts ? new Date(ts * 1000).toLocaleString('zh-CN') : '从未使用',
    },
    {
      title: '创建时间', dataIndex: 'created_at', key: 'created_at',
      render: (ts) => new Date(ts * 1000).toLocaleString('zh-CN'),
    },
    {
      title: '操作', key: 'action',
      render: (_, record) => (
        <Button type="link" size="small" onClick={() => showKeyDetail(record)}>
          详情
        </Button>
      ),
    },
  ]

  if (loading) return <Spin size="large" style={{ display: 'block', textAlign: 'center', marginTop: 80 }} />

  // 解析数据
  const wallets = summary?.normal_wallets || []
  const cnyWallet = wallets.find(w => w.currency === 'CNY') || {}
  const usdWallet = wallets.find(w => w.currency === 'USD') || {}
  const monthlyCosts = summary?.monthly_costs || []
  const cnyCost = monthlyCosts.find(c => c.currency === 'CNY') || {}

  // 用量数据已内联到 JSX 中

  return (
    <div>
      {/* 刷新按钮 */}
      <div style={{ marginBottom: 16, textAlign: 'right' }}>
        <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>
          刷新数据
        </Button>
      </div>

      {/* ---- 顶部余额卡片 ---- */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card
            style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              borderRadius: 16, border: 'none',
            }}
            bodyStyle={{ padding: '28px 24px' }}
          >
            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, marginBottom: 8 }}>
              <DollarOutlined style={{ marginRight: 6 }} />
              DeepSeek CNY 余额
            </div>
            <div style={{ fontSize: 42, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
              ¥{formatBalance(cnyWallet.balance)}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13 }}>
              <span>可兑换约 {formatBigNumber(cnyWallet.token_estimation)} Tokens</span>
              <span style={{ margin: '0 12px' }}>|</span>
              <span>本月费用 ¥{formatBalance(cnyCost.amount)}</span>
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card style={{ borderRadius: 12 }}>
            <Statistic
              title={<span style={{ fontSize: 13 }}><FileTextOutlined style={{ marginRight: 6 }} />本月 Token 用量</span>}
              value={formatBigNumber(summary?.monthly_token_usage || 0)}
              suffix="个"
              valueStyle={{ fontSize: 24, color: '#667eea' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card style={{ borderRadius: 12 }}>
            <Statistic
              title={<span style={{ fontSize: 13 }}><RiseOutlined style={{ marginRight: 6 }} />可用 Token 估值</span>}
              value={formatBigNumber(summary?.total_available_token_estimation || 0)}
              suffix="个"
              valueStyle={{ fontSize: 24, color: '#52c41a' }}
            />
          </Card>
        </Col>
      </Row>

      {/* ---- 钱包详情 ---- */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card title="🔐 API 密钥管理" style={{ borderRadius: 12 }} bodyStyle={{ padding: 0 }}>
            <Table
              dataSource={apiKeys}
              columns={keyColumns}
              rowKey="tracking_id"
              pagination={false}
              size="small"
              locale={{ emptyText: '暂无 API Key' }}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="💰 账户钱包" style={{ borderRadius: 12, height: '100%' }}>
            <Row gutter={[16, 16]}>
              <Col span={12}>
                <div style={{
                  background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                  borderRadius: 12, padding: 20, color: '#fff',
                }}>
                  <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 8 }}>CNY 钱包</div>
                  <div style={{ fontSize: 28, fontWeight: 700 }}>¥{formatBalance(cnyWallet.balance)}</div>
                  <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                    ≈ {formatBigNumber(cnyWallet.token_estimation)} Tokens
                  </div>
                </div>
              </Col>
              <Col span={12}>
                <div style={{
                  background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                  borderRadius: 12, padding: 20, color: '#fff',
                }}>
                  <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 8 }}>USD 钱包</div>
                  <div style={{ fontSize: 28, fontWeight: 700 }}>${formatBalance(usdWallet.balance)}</div>
                  <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                    ≈ {formatBigNumber(usdWallet.token_estimation)} Tokens
                  </div>
                </div>
              </Col>
              <Col span={24}>
                <div style={{
                  background: '#f9f9f9', borderRadius: 12, padding: 16,
                }}>
                  <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>本月费用</div>
                  <div style={{ display: 'flex', gap: 24 }}>
                    <div>
                      <span style={{ color: '#999', fontSize: 12 }}>CNY</span>
                      <div style={{ fontSize: 20, fontWeight: 600, color: '#f5576c' }}>
                        ¥{formatBalance(cnyCost.amount)}
                      </div>
                    </div>
                    <div>
                      <span style={{ color: '#999', fontSize: 12 }}>USD</span>
                      <div style={{ fontSize: 20, fontWeight: 600, color: '#4facfe' }}>
                        ${formatBalance((monthlyCosts.find(c => c.currency === 'USD') || {}).amount)}
                      </div>
                    </div>
                    <div>
                      <span style={{ color: '#999', fontSize: 12 }}>本月 Token</span>
                      <div style={{ fontSize: 20, fontWeight: 600, color: '#667eea' }}>
                        {formatBigNumber(summary?.monthly_token_usage || 0)}
                      </div>
                    </div>
                  </div>
                </div>
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>

      {/* ---- 用量统计 ---- */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={24}>
          <Card title="📊 本月 Token 用量（按模型）" style={{ borderRadius: 12 }}>
            {(() => {
              const amountData = usage?.amount?.data?.biz_data
              const totals = amountData?.total || []
              if (!totals.length) return <div style={{ color: '#999', textAlign: 'center', padding: 20 }}>暂无数据</div>
              const typeLabels = {
                PROMPT_TOKEN: '提示 Token',
                PROMPT_CACHE_HIT_TOKEN: '缓存命中',
                PROMPT_CACHE_MISS_TOKEN: '缓存未命中',
                RESPONSE_TOKEN: '回复 Token',
                REQUEST: '请求次数',
              }
              return (
                <Table
                  dataSource={totals}
                  rowKey="model"
                  pagination={false}
                  size="small"
                  columns={[
                    { title: '模型', dataIndex: 'model', key: 'model', render: (t) => <b>{t}</b> },
                    ...(totals[0]?.usage || []).map(u => ({
                      title: typeLabels[u.type] || u.type,
                      key: u.type,
                      render: (_, record) => {
                        const val = record.usage?.find(x => x.type === u.type)
                        return val ? formatBigNumber(val.amount) : '0'
                      },
                    })),
                  ]}
                />
              )
            })()}
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Card title="💰 本月费用（按模型）" style={{ borderRadius: 12 }}>
            {(() => {
              const costData = usage?.cost?.data?.biz_data
              // costData is an array with each element having total/days
              const costArr = Array.isArray(costData) ? costData : []
              if (!costArr.length) return <div style={{ color: '#999', textAlign: 'center', padding: 20 }}>暂无数据</div>
              
              const typeLabels = {
                PROMPT_TOKEN: '提示',
                PROMPT_CACHE_HIT_TOKEN: '缓存命中',
                PROMPT_CACHE_MISS_TOKEN: '缓存未命中',
                RESPONSE_TOKEN: '回复',
                REQUEST: '请求',
              }
              
              // Show each currency's data
              return costArr.map((currData, idx) => {
                const totals = currData?.total || []
                const currency = currData?.currency || 'CNY'
                return (
                  <div key={idx} style={{ marginBottom: idx < costArr.length - 1 ? 16 : 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#667eea' }}>
                      {currency === 'CNY' ? '🇨🇳 CNY' : '🇺🇸 USD'}
                    </div>
                    <Table
                      dataSource={totals}
                      rowKey="model"
                      pagination={false}
                      size="small"
                      columns={[
                        { title: '模型', dataIndex: 'model', render: (t) => <b>{t}</b> },
                        ...(totals[0]?.usage?.filter(u => parseFloat(u.amount) > 0) || []).map(u => ({
                          title: typeLabels[u.type] || u.type,
                          key: u.type,
                          render: (_, record) => {
                            const val = record.usage?.find(x => x.type === u.type)
                            const num = parseFloat(val?.amount || '0')
                            if (num === 0) return '-'
                            return currency === 'CNY' ? `¥${num.toFixed(4)}` : `$${num.toFixed(4)}`
                          },
                        })),
                        {
                          title: '合计',
                          key: 'total',
                          render: (_, record) => {
                            const total = (record.usage || [])
                              .filter(u => u.type !== 'REQUEST')
                              .reduce((sum, u) => sum + parseFloat(u.amount || '0'), 0)
                            if (total === 0) return '-'
                            return <b>{currency === 'CNY' ? `¥${total.toFixed(4)}` : `$${total.toFixed(4)}`}</b>
                          },
                        },
                      ]}
                    />
                  </div>
                )
              })
            })()}
          </Card>
        </Col>
        <Col span={12}>
          <Card title="📈 每日 Token 用量趋势（柱形图）" style={{ borderRadius: 12 }}
            extra={
              <DatePicker.RangePicker
                size="small"
                placeholder={['起始日期', '结束日期']}
                value={dateRange}
                onChange={(dates) => setDateRange(dates || [null, null])}
                allowClear
                style={{ width: 240 }}
              />
            }
          >
            {(() => {
              const amountData = usage?.amount?.data?.biz_data
              const days = amountData?.days || []
              if (!days.length) return <div style={{ color: '#999', textAlign: 'center', padding: 20 }}>暂无数据</div>

              // 解析每日数据
              const allDays = days
                .filter(d => d.data?.some(m => m.usage?.some(u => parseInt(u.amount) > 0)))
                .map(d => {
                  const v4pro = d.data?.find(x => x.model === 'deepseek-v4-pro')
                  const v4flash = d.data?.find(x => x.model === 'deepseek-v4-flash')
                  const getTotal = (modelData) => {
                    if (!modelData) return 0
                    return (modelData.usage || [])
                      .filter(u => u.type !== 'REQUEST')
                      .reduce((s, u) => s + parseInt(u.amount || '0'), 0)
                  }
                  const getRequests = (modelData) => {
                    if (!modelData) return 0
                    const req = modelData.usage?.find(u => u.type === 'REQUEST')
                    return req ? parseInt(req.amount || '0') : 0
                  }
                  return {
                    date: d.date,
                    shortDate: d.date.slice(5), // "05-21"
                    v4pro: getTotal(v4pro),
                    v4flash: getTotal(v4flash),
                    requests: getRequests(v4pro) + getRequests(v4flash),
                  }
                })
                .sort((a, b) => b.date.localeCompare(a.date))

              // 日期范围过滤
              let filtered = allDays
              if (dateRange[0] && dateRange[1]) {
                const start = dateRange[0].format('YYYY-MM-DD')
                const end = dateRange[1].format('YYYY-MM-DD')
                filtered = allDays.filter(d => d.date >= start && d.date <= end)
              }

              // 默认只显示前 10 条
              const displayData = filtered.slice(0, 10).reverse() // reverse so chart shows oldest → newest left→right

              if (!displayData.length) return <div style={{ color: '#999', textAlign: 'center', padding: 20 }}>暂无数据</div>

              const totalMax = Math.max(
                ...displayData.map(d => d.v4pro + d.v4flash),
                1
              )

              const formatShort = (v) => {
                if (v >= 100000000) return (v / 100000000).toFixed(1) + '亿'
                if (v >= 10000) return (v / 10000).toFixed(1) + '万'
                return v.toLocaleString()
              }

              const CustomTooltip = ({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const day = displayData.find(d => d.shortDate === label)
                if (!day) return null
                return (
                  <div style={{
                    background: '#fff', border: '1px solid #e8e8e8',
                    borderRadius: 8, padding: '10px 14px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    fontSize: 13,
                  }}>
                    <div style={{ fontWeight: 600, marginBottom: 6, color: '#333' }}>{day.date}</div>
                    {payload.map((p, i) => (
                      <div key={i} style={{ color: p.color, marginBottom: 2 }}>
                        {p.name}: <b>{formatShort(p.value)}</b>
                      </div>
                    ))}
                    <div style={{ marginTop: 4, color: '#666' }}>
                      请求数: <b>{day.requests.toLocaleString()}</b>
                    </div>
                  </div>
                )
              }

              return (
                <div>
                  <div style={{ marginBottom: 8, fontSize: 12, color: '#999' }}>
                    共 {filtered.length} 天数据，显示最近 {displayData.length} 天
                    {filtered.length > 10 && (
                      <span style={{ marginLeft: 8, color: '#667eea' }}>
                        （选择日期区间可查看更多）
                      </span>
                    )}
                  </div>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={displayData} barGap={4} barCategoryGap={8}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis
                        dataKey="shortDate"
                        tick={{ fontSize: 11, fill: '#888' }}
                        axisLine={{ stroke: '#e8e8e8' }}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#888' }}
                        axisLine={{ stroke: '#e8e8e8' }}
                        tickFormatter={formatShort}
                      />
                      <ReTooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(102, 126, 234, 0.08)' }} />
                      <Legend
                        wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                      />
                      <Bar dataKey="v4pro" name="V4-Pro" fill="#667eea" radius={[4, 4, 0, 0]} maxBarSize={36} />
                      <Bar dataKey="v4flash" name="V4-Flash" fill="#52c41a" radius={[4, 4, 0, 0]} maxBarSize={36} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )
            })()}
          </Card>
        </Col>
      </Row>

      {/* ---- 完整 Key 弹窗 ---- */}
      <Modal
        title="API Key 详情"
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={480}
      >
        {modalKey && (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="名称">{modalKey.name || '未命名'}</Descriptions.Item>
            <Descriptions.Item label="Key (脱敏)">{modalKey.masked_key}</Descriptions.Item>
            <Descriptions.Item label="创建时间">
              {new Date(modalKey.created_at * 1000).toLocaleString('zh-CN')}
            </Descriptions.Item>
            <Descriptions.Item label="最近使用">
              {modalKey.last_use
                ? new Date(modalKey.last_use * 1000).toLocaleString('zh-CN')
                : '从未使用'}
            </Descriptions.Item>
            <Descriptions.Item label="Tracking ID">
              <code style={{ fontSize: 12 }}>{modalKey.tracking_id}</code>
            </Descriptions.Item>
          </Descriptions>
        )}
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Button
            type="primary"
            icon={<EyeOutlined />}
            onClick={() => handleReveal(modalKey?.tracking_id)}
            loading={revealing[modalKey?.tracking_id]}
          >
            查看完整 Key
          </Button>
          {revealedKeys[modalKey?.tracking_id] && (
            <Button
              style={{ marginLeft: 8 }}
              icon={<CopyOutlined />}
              onClick={() => handleCopy(revealedKeys[modalKey?.tracking_id])}
            >
              复制
            </Button>
          )}
        </div>
        {revealedKeys[modalKey?.tracking_id] && (
          <div style={{
            marginTop: 12, padding: 12, background: '#fffbe6', borderRadius: 8,
            border: '1px solid #ffe58f', fontSize: 12, color: '#ad6800',
          }}>
            <WarningOutlined style={{ marginRight: 6 }} />
            注意：API Key 是敏感信息，请勿泄露给他人
          </div>
        )}
      </Modal>
    </div>
  )
}

// 简单 Statistic 组件
function Statistic({ title, value, suffix, valueStyle }) {
  return (
    <div>
      <div style={{ color: '#999', fontSize: 13, marginBottom: 4 }}>{title}</div>
      <div style={{ ...valueStyle, fontWeight: 700, fontSize: 28 }}>
        {value}
        <span style={{ fontSize: 14, fontWeight: 400, marginLeft: 4, opacity: 0.6 }}>{suffix}</span>
      </div>
    </div>
  )
}
