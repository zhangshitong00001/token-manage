import React, { useState, useEffect } from 'react'
import { Button, Typography, Row, Col, Card, Space, Tag } from 'antd'
import {
  ArrowRightOutlined, MenuOutlined, CloseOutlined,
  RobotOutlined, BarChartOutlined, WalletOutlined,
  SafetyOutlined, ThunderboltOutlined, TeamOutlined,
  LineChartOutlined, CheckCircleOutlined, StarOutlined,
  DollarOutlined, ApiOutlined, CloudServerOutlined,
} from '@ant-design/icons'

const { Title, Paragraph, Text } = Typography

const features = [
  {
    icon: <RobotOutlined style={{ fontSize: 28 }} />,
    title: 'AI Token 管理',
    desc: '一站式管理多模型的 Token 消耗，支持 DeepSeek V4-Pro / V4-Flash 等主流模型，用量一目了然。',
  },
  {
    icon: <WalletOutlined style={{ fontSize: 28 }} />,
    title: '智能充值体系',
    desc: '支持微信/支付宝扫码直接充值到 DeepSeek 账户，无需手动操作，自动同步充值记录。',
  },
  {
    icon: <LineChartOutlined style={{ fontSize: 28 }} />,
    title: '实时消耗监控',
    desc: '实时统计每小时的 Token 和费用消耗，多维度可视化图表，帮助您精准把控成本。',
  },
  {
    icon: <SafetyOutlined style={{ fontSize: 28 }} />,
    title: '多用户隔离',
    desc: '每个用户拥有独立的 Token 额度，消耗自动从个人账户扣减，余额不足时自动拦截。',
  },
  {
    icon: <BarChartOutlined style={{ fontSize: 28 }} />,
    title: '账单自动同步',
    desc: '自动从 DeepSeek 平台同步充值账单和消耗明细，无需手动记账，财务报表一键导出。',
  },
  {
    icon: <ThunderboltOutlined style={{ fontSize: 28 }} />,
    title: 'Claude Code 集成',
    desc: '内置 Claude Code 终端交互、AI 对话和数据工作台，所有 Agent 调用统一走 Token 额度管理。',
  },
]

const stats = [
  { value: '10,000+', label: '日均 Token 调用', icon: <ApiOutlined /> },
  { value: '99.9%', label: '服务可用率', icon: <CloudServerOutlined /> },
  { value: '实时', label: '数据同步延迟', icon: <CheckCircleOutlined /> },
]

const howItWorks = [
  {
    step: '01',
    title: '注册账号',
    desc: '使用邮箱快速注册，新用户自动获得初始 Token 额度。',
  },
  {
    step: '02',
    title: '充值获取额度',
    desc: '通过 DeepSeek 官方支付渠道充值，系统自动按比例分配 Token 到您的账户。',
  },
  {
    step: '03',
    title: '开始使用 AI',
    desc: '在 AI 对话、数据工作台或 Claude Code 终端中消耗 Token，实时查看使用情况。',
  },
  {
    step: '04',
    title: '监控与调整',
    desc: '通过管理后台实时监控消耗趋势，随时调整用量策略和预算。',
  },
]

export default function Landing({ onLogin, onGoToLogin, onGoToRegister }) {
  const [menuOpen, setMenuOpen] = useState(false)

  const scrollTo = (id) => {
    setMenuOpen(false)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div style={{ minHeight: '100vh', background: '#fff' }}>
      {/* ====== 导航栏 ====== */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
        background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
        padding: '0 24px', height: 64, display: 'flex', alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 'bold', fontSize: 14,
          }}>TM</div>
          <span style={{ fontSize: 18, fontWeight: 700, color: '#1a1a2e' }}>TokenManager</span>
        </div>

        {/* 桌面导航链接 */}
        <div style={{ display: 'none', gap: 32, alignItems: 'center', '@media (min-width: 768px)': { display: 'flex' } }}
          className="nav-links"
        >
          <a onClick={() => scrollTo('features')} style={{ color: '#666', cursor: 'pointer', fontSize: 14 }}>功能特性</a>
          <a onClick={() => scrollTo('how-it-works')} style={{ color: '#666', cursor: 'pointer', fontSize: 14 }}>使用流程</a>
          <a onClick={() => scrollTo('pricing')} style={{ color: '#666', cursor: 'pointer', fontSize: 14 }}>定价</a>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}
          className="nav-actions"
        >
          <Button type="text" onClick={onGoToLogin}
            style={{ fontSize: 14, color: '#667eea', fontWeight: 500 }}
          >登录</Button>
          <Button onClick={onGoToRegister}
            style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              border: 'none', color: '#fff', borderRadius: 8, fontWeight: 500,
            }}
          >免费注册</Button>
          <Button type="text"
            icon={menuOpen ? <CloseOutlined /> : <MenuOutlined />}
            onClick={() => setMenuOpen(!menuOpen)}
            className="mobile-menu-btn"
            style={{ display: 'none' }}
          />
        </div>
      </nav>

      {/* ====== Hero 区域 ====== */}
      <section style={{
        padding: '160px 24px 100px',
        background: 'linear-gradient(135deg, #0c0c2e 0%, #1a1a4e 40%, #2d1b69 70%, #667eea 100%)',
        textAlign: 'center', position: 'relative', overflow: 'hidden',
      }}>
        {/* 装饰光晕 */}
        <div style={{
          position: 'absolute', top: '-10%', right: '-5%',
          width: 500, height: 500, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(102,126,234,0.2) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: '-10%', left: '-5%',
          width: 400, height: 400, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(118,75,162,0.15) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div style={{ maxWidth: 800, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{
            display: 'inline-block', padding: '6px 16px',
            background: 'rgba(102,126,234,0.2)', borderRadius: 20,
            border: '1px solid rgba(102,126,234,0.3)',
            color: 'rgba(255,255,255,0.8)', fontSize: 13, marginBottom: 24,
          }}>
            🚀 新一代 AI Token 管理平台
          </div>

          <Title style={{
            color: '#fff', fontSize: 48, fontWeight: 800,
            lineHeight: 1.2, margin: 0, marginBottom: 20,
          }}>
            让每一分 AI 预算
            <br />
            <span style={{ background: 'linear-gradient(135deg, #667eea, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              都花在刀刃上
            </span>
          </Title>

          <Paragraph style={{
            color: 'rgba(255,255,255,0.7)', fontSize: 17,
            maxWidth: 600, margin: '0 auto 32px', lineHeight: 1.7,
          }}>
            TokenManager 是一个轻量、高效的 AI Token 管理与用量监控平台。
            支持 DeepSeek 等多模型接入，提供实时消耗统计、智能充值、用户额度管理等功能，
            让 AI 团队协作更加高效、透明。
          </Paragraph>

          <Space size={16}>
            <Button size="large" onClick={onGoToRegister}
              style={{
                height: 52, borderRadius: 12, padding: '0 32px',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                border: 'none', color: '#fff', fontSize: 16, fontWeight: 600,
                boxShadow: '0 8px 24px rgba(102,126,234,0.4)',
              }}
            >免费开始使用 <ArrowRightOutlined /></Button>
            <Button size="large" onClick={() => scrollTo('features')}
              style={{
                height: 52, borderRadius: 12, padding: '0 24px',
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.2)', color: '#fff',
                fontSize: 16,
              }}
            >了解更多</Button>
          </Space>
        </div>
      </section>

      {/* ====== 数据统计 ====== */}
      <section style={{ padding: '60px 24px', background: '#f8f9ff' }}>
        <Row gutter={[24, 24]} justify="center">
          {stats.map((s, i) => (
            <Col xs={8} key={i} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 32, color: '#667eea', marginBottom: 8 }}>{s.icon}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#1a1a2e' }}>{s.value}</div>
              <div style={{ fontSize: 13, color: '#999' }}>{s.label}</div>
            </Col>
          ))}
        </Row>
      </section>

      {/* ====== 功能特性 ====== */}
      <section id="features" style={{ padding: '100px 24px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 60 }}>
          <Tag color="blue" style={{ fontSize: 12, marginBottom: 12 }}>核心功能</Tag>
          <Title level={2} style={{ fontWeight: 700, color: '#1a1a2e' }}>
            全方位 AI 资源管理
          </Title>
          <Paragraph style={{ color: '#666', fontSize: 15, maxWidth: 600, margin: '0 auto' }}>
            从 Token 分配到消耗监控，从充值管理到用户权限，一站式解决 AI 团队资源管理需求
          </Paragraph>
        </div>

        <Row gutter={[24, 24]}>
          {features.map((f, i) => (
            <Col xs={24} md={8} key={i}>
              <Card
                hoverable
                style={{
                  borderRadius: 16, height: '100%',
                  border: '1px solid #f0f0f0',
                  transition: 'all 0.3s',
                }}
                bodyStyle={{ padding: '28px 24px' }}
              >
                <div style={{
                  width: 52, height: 52, borderRadius: 14,
                  background: 'linear-gradient(135deg, #667eea15, #764ba215)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#667eea', marginBottom: 16,
                }}>
                  {f.icon}
                </div>
                <Title level={4} style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px' }}>{f.title}</Title>
                <Paragraph style={{ color: '#666', fontSize: 13, lineHeight: 1.7, margin: 0 }}>{f.desc}</Paragraph>
              </Card>
            </Col>
          ))}
        </Row>
      </section>

      {/* ====== 使用流程 ====== */}
      <section id="how-it-works" style={{
        padding: '100px 24px',
        background: 'linear-gradient(135deg, #f8f9ff 0%, #f0f0ff 100%)',
      }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 60 }}>
            <Tag color="purple" style={{ fontSize: 12, marginBottom: 12 }}>快速上手</Tag>
            <Title level={2} style={{ fontWeight: 700, color: '#1a1a2e' }}>四步开始使用</Title>
            <Paragraph style={{ color: '#666', fontSize: 15 }}>
              从注册到使用，只需几分钟
            </Paragraph>
          </div>

          <Row gutter={[24, 24]}>
            {howItWorks.map((h, i) => (
              <Col xs={24} sm={12} md={6} key={i}>
                <div style={{ textAlign: 'center', padding: '0 8px' }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: '50%',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 20, fontWeight: 700,
                    margin: '0 auto 16px',
                    boxShadow: '0 6px 20px rgba(102,126,234,0.3)',
                  }}>
                    {h.step}
                  </div>
                  <Title level={4} style={{ fontSize: 15, fontWeight: 600, margin: '0 0 8px' }}>{h.title}</Title>
                  <Paragraph style={{ color: '#666', fontSize: 12, lineHeight: 1.6, margin: 0 }}>{h.desc}</Paragraph>
                </div>
              </Col>
            ))}
          </Row>
        </div>
      </section>

      {/* ====== CTA 区域 ====== */}
      <section id="pricing" style={{
        padding: '100px 24px',
        background: 'linear-gradient(135deg, #0c0c2e 0%, #1a1a4e 50%, #2d1b69 100%)',
        textAlign: 'center',
      }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <Title level={2} style={{ color: '#fff', fontWeight: 700, margin: 0 }}>
            准备好开始了吗？
          </Title>
          <Paragraph style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15, marginTop: 16, marginBottom: 32 }}>
            注册即送初始 Token 额度，无需预付费，用多少充多少
          </Paragraph>
          <Space size={16}>
            <Button size="large" onClick={onGoToRegister}
              style={{
                height: 52, borderRadius: 12, padding: '0 36px',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                border: 'none', color: '#fff', fontSize: 16, fontWeight: 600,
                boxShadow: '0 8px 24px rgba(102,126,234,0.4)',
              }}
            >立即注册 <ArrowRightOutlined /></Button>
            <Button size="large" onClick={onGoToLogin}
              style={{
                height: 52, borderRadius: 12, padding: '0 24px',
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.2)', color: '#fff',
                fontSize: 16,
              }}
            >已有账号？登录</Button>
          </Space>
        </div>
      </section>

      {/* ====== Footer ====== */}
      <footer style={{
        background: '#0c0c2e', padding: '40px 24px',
        borderTop: '1px solid rgba(255,255,255,0.05)',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 'bold', fontSize: 16,
            margin: '0 auto 16px',
          }}>TM</div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
            © 2026 TokenManager. All rights reserved.
          </div>
        </div>
      </footer>

      {/* 移动端菜单内联样式 */}
      <style>{`
        @media (min-width: 768px) {
          .nav-links { display: flex !important; }
          .mobile-menu-btn { display: none !important; }
        }
        @media (max-width: 767px) {
          .nav-links { display: none !important; }
          .mobile-menu-btn { display: inline-flex !important; }
          .nav-actions .ant-btn-text:not(.mobile-menu-btn) { display: none; }
        }
      `}</style>
    </div>
  )
}
