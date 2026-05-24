import React, { useState, useEffect } from 'react'
import { Row, Col, Card, Spin, Table, Tag } from 'antd'
import {
  RiseOutlined, WalletOutlined,
} from '@ant-design/icons'
import api from '../api'
import dayjs from 'dayjs'

export default function Dashboard() {
  const [usageData, setUsageData] = useState([])
  const [dsStats, setDsStats] = useState(null)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/admin/usage/list?page_size=10'),
      api.get('/admin/deepseek/usage'),
      api.get('/admin/deepseek/summary'),
      api.get('/admin/statistics'),
    ]).then(([u, du, dss, s]) => {
      setUsageData(u.items)
      setStats(s)

      // 从 DeepSeek 用量数据中计算今日消耗
      const amountData = du?.data?.amount?.data?.biz_data
      const days = amountData?.days || []
      const today = new Date().toISOString().slice(0, 10)
      const todayData = days.find(d => d.date === today)

      let todayTokens = 0
      if (todayData) {
        todayData.data.forEach(model => {
          model.usage.forEach(u => {
            todayTokens += parseInt(u.amount || '0')
          })
        })
      }

      // 从 summary 获取月度数据
      const summary = dss?.data || {}
      const monthlyTokens = parseInt(summary.monthly_token_usage || 0)
      const wallets = summary.normal_wallets || []
      const cnyWallet = wallets.find(w => w.currency === 'CNY') || {}
      const cnyBalance = parseFloat(cnyWallet.balance || '0')

      setDsStats({ todayTokens, monthlyTokens, cnyBalance })
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  if (loading) return <Spin size="large" style={{ display: 'block', textAlign: 'center', marginTop: 80 }} />

  const formatNum = (n) => {
    if (!n || isNaN(n)) return '0'
    if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿'
    if (n >= 10000) return (n / 10000).toFixed(1) + '万'
    return n.toLocaleString()
  }

  const columns = [
    { title: '时间', dataIndex: 'usage_time', render: (t) => dayjs(t).format('YYYY-MM-DD HH:mm:ss') },
    { title: '用户ID', dataIndex: 'user_id' },
    { title: 'Agent', dataIndex: 'agent_name' },
    { title: '输入Token', dataIndex: 'input_tokens' },
    { title: '输出Token', dataIndex: 'output_tokens' },
    { title: '消耗', dataIndex: 'total_cost', render: (v) => <Tag color="blue">{v.toLocaleString()}</Tag> },
  ]

  return (
    <div>
      {/* ---- DeepSeek 真实消耗 ---- */}
      <div style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        borderRadius: 16, padding: '20px 24px', marginBottom: 24,
      }}>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
          <RiseOutlined />
          DeepSeek 账户实时消耗
        </div>
        <Row gutter={[24, 16]}>
          <Col span={6}>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginBottom: 4 }}>今日 Token 消耗</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#fff' }}>
              {formatNum(dsStats?.todayTokens || 0)}
              <span style={{ fontSize: 14, fontWeight: 400, marginLeft: 6, opacity: 0.7 }}>个</span>
            </div>
          </Col>
          <Col span={6}>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginBottom: 4 }}>本月 Token 消耗</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#fff' }}>
              {formatNum(dsStats?.monthlyTokens || 0)}
              <span style={{ fontSize: 14, fontWeight: 400, marginLeft: 6, opacity: 0.7 }}>个</span>
            </div>
          </Col>
          <Col span={6}>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginBottom: 4 }}>账户余额</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#fff' }}>
              ¥{(dsStats?.cnyBalance || 0).toFixed(2)}
            </div>
          </Col>
          <Col span={6}>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginBottom: 4 }}>本月费用</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>
              ¥89.56
              <span style={{ fontSize: 12, fontWeight: 400, marginLeft: 6, opacity: 0.7 }}>/ 月</span>
            </div>
          </Col>
        </Row>
      </div>

      {/* ---- 充值统计卡片 ---- */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card
            style={{ borderRadius: 12, background: 'linear-gradient(135deg, #52c41a 0%, #237804 100%)', color: '#fff', border: 'none' }}
            bodyStyle={{ padding: '20px 24px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <WalletOutlined style={{ fontSize: 20 }} />
              <span style={{ fontSize: 14, opacity: 0.85 }}>今日充值成功</span>
            </div>
            <div style={{ fontSize: 32, fontWeight: 700 }}>
              ¥{((stats?.today_total_recharge || 0) / 100).toFixed(2)}
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card
            style={{ borderRadius: 12, background: 'linear-gradient(135deg, #1677ff 0%, #0958d9 100%)', color: '#fff', border: 'none' }}
            bodyStyle={{ padding: '20px 24px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <WalletOutlined style={{ fontSize: 20 }} />
              <span style={{ fontSize: 14, opacity: 0.85 }}>历史充值成功总额</span>
            </div>
            <div style={{ fontSize: 32, fontWeight: 700 }}>
              ¥{((stats?.total_recharge_amount || 0) / 100).toFixed(2)}
            </div>
          </Card>
        </Col>
        <Col span={4}>
          <Card
            style={{ borderRadius: 12, background: 'linear-gradient(135deg, #fa8c16 0%, #d46b08 100%)', color: '#fff', border: 'none' }}
            bodyStyle={{ padding: '20px 24px' }}
          >
            <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 8 }}>总用户</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{stats?.total_users || 0}</div>
          </Card>
        </Col>
        <Col span={4}>
          <Card
            style={{ borderRadius: 12, background: 'linear-gradient(135deg, #eb2f96 0%, #c41d7f 100%)', color: '#fff', border: 'none' }}
            bodyStyle={{ padding: '20px 24px' }}
          >
            <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 8 }}>活跃用户</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{stats?.active_users || 0}</div>
          </Card>
        </Col>
      </Row>

      {/* ---- 消耗记录 ---- */}
      <Card title="最新消耗记录" style={{ borderRadius: 12 }}>
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
