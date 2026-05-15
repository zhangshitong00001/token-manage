import React, { useState, useEffect } from 'react'
import { Row, Col, Card, Statistic, Spin, Table, Tag } from 'antd'
import { ArrowUpOutlined, ArrowDownOutlined, UserOutlined, DollarOutlined, FileTextOutlined } from '@ant-design/icons'
import api from '../api'
import dayjs from 'dayjs'

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [usageData, setUsageData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/admin/statistics'),
      api.get('/admin/usage/list?page_size=10'),
    ]).then(([s, u]) => {
      setStats(s)
      setUsageData(u.items)
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  if (loading) return <Spin size="large" style={{ display: 'block', textAlign: 'center', marginTop: 80 }} />

  const columns = [
    { title: '时间', dataIndex: 'usage_time', render: (t) => dayjs(t).format('MM-DD HH:mm') },
    { title: '用户ID', dataIndex: 'user_id' },
    { title: 'Agent', dataIndex: 'agent_name' },
    { title: '输入Token', dataIndex: 'input_tokens' },
    { title: '输出Token', dataIndex: 'output_tokens' },
    { title: '消耗', dataIndex: 'total_cost', render: (v) => <Tag color="blue">{v.toLocaleString()}</Tag> },
  ]

  return (
    <div>
      <Row gutter={16}>
        <Col span={6}>
          <Card>
            <Statistic
              title="今日消耗 Token"
              value={stats?.today_total_usage || 0}
              suffix="个"
              valueStyle={{ color: '#1890ff' }}
              prefix={<FileTextOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="今日充值金额"
              value={(stats?.today_total_recharge || 0) / 100}
              precision={2}
              suffix="元"
              valueStyle={{ color: '#52c41a' }}
              prefix={<DollarOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="活跃用户"
              value={stats?.active_users || 0}
              suffix="人"
              valueStyle={{ color: '#722ed1' }}
              prefix={<UserOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="总用户数"
              value={stats?.total_users || 0}
              suffix="人"
              prefix={<UserOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Card title="最新消耗记录" style={{ marginTop: 24 }}>
        <Table
          dataSource={usageData}
          columns={columns}
          rowKey="id"
          pagination={false}
          size="small"
        />
      </Card>
    </div>
  )
}
