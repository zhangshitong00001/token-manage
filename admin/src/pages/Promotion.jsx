import React from 'react'
import { Card, Row, Col, Typography, Tag, Space, Button, Divider, Statistic } from 'antd'
import {
  RocketOutlined, LineChartOutlined, WalletOutlined,
  SafetyOutlined, ThunderboltOutlined, MobileOutlined,
  GithubOutlined,
} from '@ant-design/icons'

const { Title, Paragraph, Text } = Typography

const features = [
  {
    icon: <WalletOutlined style={{ fontSize: 28, color: '#1677ff' }} />,
    title: '智能充值',
    desc: '支持微信/支付宝充值，多种套餐灵活选择。自动提醒余额不足，再也不怕 API 调用中断。',
    color: '#e6f4ff',
  },
  {
    icon: <LineChartOutlined style={{ fontSize: 28, color: '#722ed1' }} />,
    title: '实时监控',
    desc: 'Token 消耗实时统计，日/周/月趋势可视化。支持 DeepSeek V4-Pro、V4-Flash 等多模型用量对比。',
    color: '#f9f0ff',
  },
  {
    icon: <RocketOutlined style={{ fontSize: 28, color: '#52c41a' }} />,
    title: '账单同步',
    desc: '自动同步 DeepSeek 官方账单，订单状态一目了然。支持 SUCCESS / CREATED / FAILED 状态筛选。',
    color: '#f6ffed',
  },
  {
    icon: <SafetyOutlined style={{ fontSize: 28, color: '#fa8c16' }} />,
    title: '多角色权限',
    desc: '管理员与普通用户分离。管理员可管理用户、配置价格、查看全平台数据；用户自助充值查询。',
    color: '#fff7e6',
  },
  {
    icon: <ThunderboltOutlined style={{ fontSize: 28, color: '#f5222d' }} />,
    title: 'DeepSeek 集成',
    desc: '原生对接 DeepSeek 平台 API，支持 V4-Pro 和 V4-Flash 模型。一键同步用量与账单数据。',
    color: '#fff1f0',
  },
  {
    icon: <MobileOutlined style={{ fontSize: 28, color: '#13c2c2' }} />,
    title: '多端适配',
    desc: 'H5 移动端 + 后台管理界面双端适配。手机随时查看余额消耗，电脑端完整管理，随时随地掌控。',
    color: '#e6fffb',
  },
]

const techStack = [
  'FastAPI', 'PostgreSQL', 'Redis', 'Vue 3', 'React', 'Nginx',
]

export default function Promotion() {
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Hero */}
      <div style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        borderRadius: 16, padding: '48px 40px', marginBottom: 24,
        textAlign: 'center', color: '#fff',
      }}>
        <Title level={2} style={{ color: '#fff', margin: 0, fontSize: 32 }}>
          🚀 TokenManager
        </Title>
        <Paragraph style={{ color: 'rgba(255,255,255,0.85)', fontSize: 16, marginTop: 12 }}>
          轻量、高效的 AI Token 管理与用量监控平台
        </Paragraph>
        <Paragraph style={{ color: 'rgba(255,255,255,0.65)', fontSize: 14, maxWidth: 600, margin: '0 auto' }}>
          支持 DeepSeek 等多模型，实时统计消耗，智能充值，让每一分钱都花在刀刃上
        </Paragraph>
        <Space style={{ marginTop: 24 }} size="large">
          <Statistic title="注册用户" value={100} suffix="+" valueStyle={{ color: '#fff' }} />
          <Statistic title="Token 消耗" value={5} suffix="M+" valueStyle={{ color: '#fff' }} />
          <Statistic title="服务可用率" value={99.9} suffix="%" valueStyle={{ color: '#fff' }} />
          <Statistic title="稳定运行" value="7×24" valueStyle={{ color: '#fff' }} />
        </Space>
      </div>

      {/* 核心功能 */}
      <Title level={4} style={{ marginBottom: 16 }}>核心功能</Title>
      <Row gutter={[16, 16]}>
        {features.map((f, i) => (
          <Col xs={24} sm={12} md={8} key={i}>
            <Card
              hoverable
              style={{ borderRadius: 12, height: '100%', border: '1px solid #f0f0f0' }}
              bodyStyle={{ padding: 24 }}
            >
              <div style={{
                width: 56, height: 56, borderRadius: 12,
                background: f.color, display: 'flex',
                alignItems: 'center', justifyContent: 'center', marginBottom: 16,
              }}>
                {f.icon}
              </div>
              <Title level={5} style={{ margin: '0 0 8px' }}>{f.title}</Title>
              <Text type="secondary" style={{ fontSize: 13 }}>{f.desc}</Text>
            </Card>
          </Col>
        ))}
      </Row>

      <Divider />

      {/* 技术架构 */}
      <Title level={4} style={{ marginBottom: 16 }}>技术架构</Title>
      <Card style={{ borderRadius: 12, textAlign: 'center' }}>
        <Space wrap size="large">
          {techStack.map(t => (
            <Tag key={t} color="blue" style={{ padding: '4px 16px', fontSize: 14, borderRadius: 20 }}>
              {t}
            </Tag>
          ))}
        </Space>
      </Card>

      <Divider />

      {/* 定价 */}
      <Title level={4} style={{ marginBottom: 16 }}>灵活定价</Title>
      <Row gutter={16}>
        {[
          { name: '体验包', amount: '10万', price: '¥1', desc: '低门槛体验', featured: false },
          { name: '基础包', amount: '100万', price: '¥5', desc: '性价比之选', featured: true },
          { name: '进阶包', amount: '1000万', price: '¥30', desc: '适合团队', featured: false },
          { name: '企业包', amount: '1亿', price: '¥200', desc: '量大价优', featured: false },
        ].map((pkg, i) => (
          <Col xs={12} sm={6} key={i}>
            <Card
              hoverable
              style={{
                borderRadius: 12, textAlign: 'center',
                border: pkg.featured ? '2px solid #722ed1' : '1px solid #f0f0f0',
              }}
            >
              <Title level={5} style={{ margin: 0 }}>{pkg.name}</Title>
              <div style={{ fontSize: 32, fontWeight: 700, color: '#1677ff', margin: '12px 0' }}>
                {pkg.amount}
              </div>
              <div style={{ fontSize: 24, fontWeight: 600 }}>{pkg.price}</div>
              <Text type="secondary" style={{ fontSize: 12 }}>{pkg.desc}</Text>
            </Card>
          </Col>
        ))}
      </Row>

      <Divider />

      {/* CTA */}
      <Card
        style={{
          borderRadius: 12,
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          textAlign: 'center', color: '#fff', border: 'none',
        }}
      >
        <Title level={4} style={{ color: '#fff', margin: 0 }}>
          立即开始管理你的 AI Token
        </Title>
        <Paragraph style={{ color: 'rgba(255,255,255,0.75)', marginTop: 8 }}>
          注册即送 10 万 Token 体验额度，无需信用卡，随时取消
        </Paragraph>
      </Card>
    </div>
  )
}
