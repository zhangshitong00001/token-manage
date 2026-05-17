import React, { useState, useEffect } from 'react'
import { Row, Col, Card, Statistic, Table, DatePicker, Spin, Tag, Button, Space } from 'antd'
import { FileTextOutlined, ArrowUpOutlined, ReloadOutlined, BarChartOutlined } from '@ant-design/icons'
import api from '../api'
import dayjs from 'dayjs'

export default function SystemUsage() {
  const [dailyData, setDailyData] = useState([])
  const [summary, setSummary] = useState(null)
  const [dsBalance, setDsBalance] = useState(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)

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

  useEffect(() => { loadData() }, [])

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
        </Space>
      </div>

      {loading ? (
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
      )}
    </div>
  )
}
