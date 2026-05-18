import React, { useState, useEffect } from 'react'
import { Row, Col, Card, Statistic, Table, DatePicker, Spin, Tag, Button, Space, Tabs, Tooltip } from 'antd'
import { FileTextOutlined, ArrowUpOutlined, ReloadOutlined, BarChartOutlined, ThunderboltOutlined, CloudServerOutlined, ApiOutlined, DatabaseOutlined } from '@ant-design/icons'
import api from '../api'
import dayjs from 'dayjs'

export default function SystemUsage() {
  const [tab, setTab] = useState('daily')
  const [dailyData, setDailyData] = useState([])
  const [summary, setSummary] = useState(null)
  const [dsBalance, setDsBalance] = useState(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)

  // 实时数据
  const [realtime, setRealtime] = useState(null)
  const [realtimeHours, setRealtimeHours] = useState(24)
  const [rtLoading, setRtLoading] = useState(false)

  const loadData = (d = days) => {
    setLoading(true)
    Promise.all([
      api.get('/admin/system-usage/daily', { params: { days: d } }),
      api.get('/admin/system-usage/summary', { params: { days: d } }),
      api.get('/admin/deepseek/balance'),
    ]).then(([daily, sum, balance]) => {
      setDailyData(daily.items || [])
      setSummary(sum)
      setDsBalance(balance)
    }).catch(console.error).finally(() => setLoading(false))
  }

  const loadRealtime = (h = realtimeHours) => {
    setRtLoading(true)
    api.get('/admin/system-usage/realtime', { params: { hours: h } })
      .then(setRealtime)
      .catch(console.error)
      .finally(() => setRtLoading(false))
  }

  useEffect(() => { loadData() }, [])
  useEffect(() => { loadRealtime() }, [])

  const columns = [
    {
      title: '日期',
      dataIndex: 'stats_date',
      width: 110,
      render: (v) => <strong>{v}</strong>,
      defaultSortOrder: 'descend',
      sorter: (a, b) => a.stats_date.localeCompare(b.stats_date),
    },
    {
      title: 'Input',
      dataIndex: 'total_input_tokens',
      render: (v) => (v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v?.toLocaleString()),
      sorter: (a, b) => a.total_input_tokens - b.total_input_tokens,
    },
    {
      title: 'Output',
      dataIndex: 'total_output_tokens',
      render: (v) => (v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v?.toLocaleString()),
      sorter: (a, b) => a.total_output_tokens - b.total_output_tokens,
    },
    {
      title: '总Token',
      dataIndex: 'total_tokens',
      render: (v) => {
        const color = v > 1000000 ? '#ff4d4f' : v > 500000 ? '#faad14' : '#52c41a'
        return <Tag color={color}>{(v / 10000).toFixed(1)}万</Tag>
      },
      sorter: (a, b) => a.total_tokens - b.total_tokens,
    },
    {
      title: '缓存读取',
      dataIndex: 'total_cache_read_tokens',
      render: (v) => (v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v?.toLocaleString()),
    },
    {
      title: '会话数',
      dataIndex: 'session_count',
      width: 70,
    },
    {
      title: 'API调用',
      dataIndex: 'api_call_count',
      width: 80,
    },
    {
      title: '费用(USD)',
      dataIndex: 'estimated_cost_usd',
      width: 100,
      render: (v) => <span style={{ color: v > 0.1 ? '#ff4d4f' : '#52c41a' }}>${v?.toFixed(4)}</span>,
      sorter: (a, b) => a.estimated_cost_usd - b.estimated_cost_usd,
    },
  ]

  // 计算7天趋势
  const recent7 = dailyData.slice(0, 7)
  const maxToken = Math.max(...recent7.map(r => r.total_tokens || 0), 1)

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: 18, color: '#333' }}>
          <BarChartOutlined style={{ marginRight: 8, color: '#1890ff' }} />
          系统Token消耗统计
        </h3>
        <Space>
          {tab === 'daily' ? (
            <>
              <DatePicker.RangePicker
                onChange={(dates) => {
                  if (dates?.[0] && dates?.[1]) {
                    const d = dates[1].diff(dates[0], 'day') + 1
                    setDays(d)
                    loadData(d)
                  }
                }}
              />
              <Button icon={<ReloadOutlined />} onClick={() => loadData()}>刷新</Button>
            </>
          ) : (
            <>
              <Space.Compact>
                {[1, 6, 12, 24, 48, 168].map(h => (
                  <Button
                    key={h}
                    type={realtimeHours === h ? 'primary' : 'default'}
                    size="small"
                    onClick={() => { setRealtimeHours(h); loadRealtime(h) }}
                  >
                    {h >= 24 ? `${h/24}d` : `${h}h`}
                  </Button>
                ))}
              </Space.Compact>
              <Button icon={<ReloadOutlined />} onClick={() => loadRealtime()}>刷新</Button>
            </>
          )}
        </Space>
      </div>

      <Tabs activeKey={tab} onChange={setTab} items={[
        {
          key: 'daily',
          label: <span><DatabaseOutlined /> 每日汇总</span>,
          children: dailyContent(),
        },
        {
          key: 'realtime',
          label: <span><ThunderboltOutlined /> 实时数据</span>,
          children: realtimeContent(),
        },
      ]} />
    </div>
  )

  function dailyContent() {
    return loading ? (
      <Spin size="large" style={{ display: 'block', textAlign: 'center', marginTop: 60 }} />
    ) : (
      <>
        {/* 汇总卡片 */}
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Card hoverable styles={{ body: { padding: '16px 20px' } }}>
              <Statistic
                title="近7天总Token"
                value={(summary?.total_tokens || 0) / 10000}
                suffix="万"
                precision={1}
                valueStyle={{ color: '#1890ff' }}
                prefix={<FileTextOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card hoverable styles={{ body: { padding: '16px 20px' } }}>
              <Statistic
                title="日均Token"
                value={(summary?.avg_daily_tokens || 0) / 10000}
                suffix="万"
                precision={1}
                valueStyle={{ color: '#722ed1' }}
                prefix={<ArrowUpOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card hoverable styles={{ body: { padding: '16px 20px' } }}>
              <Statistic
                title="总费用(USD)"
                value={summary?.total_cost_usd || 0}
                precision={4}
                suffix="$"
                valueStyle={{ color: summary?.total_cost_usd > 1 ? '#ff4d4f' : '#52c41a' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card hoverable styles={{ body: { padding: '16px 20px' } }}>
              <Statistic
                title="DeepSeek 余额"
                value={dsBalance?.cny_balance || 0}
                precision={2}
                prefix="¥"
                valueStyle={{ color: '#1677ff' }}
                suffix={<span style={{ fontSize: 12 }}>{dsBalance?.cny_granted > 0 ? `(含赠送 ¥${dsBalance.cny_granted})` : ''}</span>}
              />
            </Card>
          </Col>
        </Row>

        {/* 7天趋势迷你图 */}
        {recent7.length > 0 && (
          <Card title="近7天Token消耗趋势" size="small" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120, padding: '8px 0' }}>
              {recent7.map((r, i) => {
                const h = Math.max((r.total_tokens / maxToken) * 100, 5)
                const color = r.total_tokens > 500000 ? '#ff4d4f' : '#1890ff'
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 11, color: '#666' }}>{(r.total_tokens / 10000).toFixed(0)}万</span>
                    <div
                      style={{
                        width: '100%',
                        height: `${h}%`,
                        background: `linear-gradient(180deg, ${color}88, ${color})`,
                        borderRadius: '4px 4px 0 0',
                        transition: 'height 0.3s',
                        minHeight: 8,
                        cursor: 'pointer',
                      }}
                      title={`${r.stats_date}: ${(r.total_tokens / 10000).toFixed(1)}万 token`}
                    />
                    <span style={{ fontSize: 10, color: '#999' }}>{r.stats_date.slice(5)}</span>
                  </div>
                )
              })}
            </div>
          </Card>
        )}

        {/* 每日明细表 */}
        <Card title="每日消耗明细" size="small">
          <Table
            dataSource={dailyData}
            columns={columns}
            rowKey="stats_date"
            pagination={{ pageSize: 15, showTotal: (t) => `共 ${t} 天` }}
            size="small"
          />
        </Card>
      </>
    )
  }

  function realtimeContent() {
    if (rtLoading || !realtime) {
      return (
        <Spin size="large" style={{ display: 'block', textAlign: 'center', marginTop: 60 }} />
      )
    }
    const s = realtime.summary
    return (
      <>
        {/* 实时汇总卡片 */}
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Card hoverable styles={{ body: { padding: '16px 20px' } }}>
              <Statistic
                title={`最近${realtime.period_hours}h 总Token`}
                value={(s.total_tokens || 0) / 10000}
                suffix="万"
                precision={1}
                valueStyle={{ color: '#1890ff' }}
                prefix={<ThunderboltOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card hoverable styles={{ body: { padding: '16px 20px' } }}>
              <Statistic
                title="Input / Output"
                value={`${(s.input_tokens / 10000).toFixed(1)}万 / ${(s.output_tokens / 10000).toFixed(1)}万`}
                valueStyle={{ fontSize: 16, color: '#52c41a' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card hoverable styles={{ body: { padding: '16px 20px' } }}>
              <Statistic
                title="会话数 / API调用"
                value={`${s.session_count} / ${s.api_call_count}`}
                valueStyle={{ fontSize: 16, color: '#722ed1' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card hoverable styles={{ body: { padding: '16px 20px' } }}>
              <Statistic
                title="缓存读取"
                value={(s.cache_read_tokens || 0) >= 10000 ? `${(s.cache_read_tokens / 10000).toFixed(1)}万` : (s.cache_read_tokens || 0).toLocaleString()}
                valueStyle={{ color: '#fa8c16' }}
                prefix={<CloudServerOutlined />}
              />
            </Card>
          </Col>
        </Row>

        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          {/* 按来源分布 */}
          <Col span={12}>
            <Card title="按来源分布" size="small">
              <Table
                dataSource={realtime.by_source}
                columns={[
                  { title: '来源', dataIndex: 'source', width: 100, render: (v) => <Tag color={v === 'weixin' ? '#07C160' : v === 'cli' ? '#6E7681' : v === 'cron' ? '#FA8C16' : '#1890ff'}>{v}</Tag> },
                  { title: '会话', dataIndex: 'session_count', width: 60 },
                  { title: 'Input', dataIndex: 'input_tokens', render: (v) => v >= 10000 ? `${(v/10000).toFixed(1)}万` : v?.toLocaleString() },
                  { title: 'Output', dataIndex: 'output_tokens', render: (v) => v >= 10000 ? `${(v/10000).toFixed(1)}万` : v?.toLocaleString() },
                  { title: '合计', dataIndex: 'total_tokens', render: (v) => <Tag color={v > 100000 ? '#ff4d4f' : '#52c41a'}>{(v/10000).toFixed(1)}万</Tag> },
                ]}
                rowKey="source"
                size="small"
                pagination={false}
              />
            </Card>
          </Col>
          {/* 按模型分布 */}
          <Col span={12}>
            <Card title="按模型分布" size="small">
              <Table
                dataSource={realtime.by_model}
                columns={[
                  { title: '模型', dataIndex: 'model', render: (v) => <Tag color="purple">{v}</Tag> },
                  { title: '会话', dataIndex: 'session_count', width: 60 },
                  { title: 'Input', dataIndex: 'input_tokens', render: (v) => v >= 10000 ? `${(v/10000).toFixed(1)}万` : v?.toLocaleString() },
                  { title: 'Output', dataIndex: 'output_tokens', render: (v) => v >= 10000 ? `${(v/10000).toFixed(1)}万` : v?.toLocaleString() },
                  { title: '缓存', dataIndex: 'cache_read_tokens', render: (v) => v >= 10000 ? `${(v/10000).toFixed(1)}万` : v?.toLocaleString() },
                ]}
                rowKey="model"
                size="small"
                pagination={false}
              />
            </Card>
          </Col>
        </Row>

        {/* 最近会话 */}
        <Card title={<span><ApiOutlined /> 最近会话（最近50条）</span>} size="small">
          <Table
            dataSource={realtime.recent_sessions}
            columns={[
              { title: '时间', dataIndex: 'started_at', width: 100, render: (v) => {
                const t = new Date(v * 1000)
                return <span style={{ fontSize: 12 }}>{`${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`}</span>
              }},
              { title: '来源', dataIndex: 'source', width: 70, render: (v) => <Tag style={{ fontSize: 10, lineHeight: '16px' }}>{v}</Tag> },
              { title: '模型', dataIndex: 'model', width: 120, render: (v) => <span style={{ fontSize: 12, color: '#666' }}>{v}</span> },
              { title: 'Input', dataIndex: 'input_tokens', width: 80, render: (v) => v?.toLocaleString() },
              { title: 'Output', dataIndex: 'output_tokens', width: 80, render: (v) => v?.toLocaleString() },
              { title: '合计', dataIndex: 'total_tokens', width: 80, render: (v) => <Tag>{v?.toLocaleString()}</Tag> },
              { title: '消息', dataIndex: 'message_count', width: 50 },
              { title: '耗时', dataIndex: 'duration_s', width: 70, render: (v) => v ? `${v.toFixed(0)}s` : '-' },
            ]}
            rowKey="session_id"
            size="small"
            pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
          />
        </Card>
      </>
    )
  }
}
