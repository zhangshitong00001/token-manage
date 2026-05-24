import React, { useState, useRef, useEffect } from 'react'
import { Form, Input, Button, Card, message, Typography, Space, Alert, Tabs, Row, Col } from 'antd'
import { MailOutlined, SafetyCertificateOutlined, LockOutlined, UserOutlined, KeyOutlined, WalletOutlined, LineChartOutlined, RocketOutlined, SafetyOutlined, ThunderboltOutlined, MobileOutlined } from '@ant-design/icons'
import api from '../api'

const { Title, Text, Paragraph } = Typography

const features = [
  { icon: <WalletOutlined style={{ fontSize: 24, color: '#1677ff' }} />, title: '智能充值', desc: '支持微信/支付宝充值，多种套餐灵活选择' },
  { icon: <LineChartOutlined style={{ fontSize: 24, color: '#722ed1' }} />, title: '实时监控', desc: 'Token 消耗实时统计，多模型用量对比' },
  { icon: <RocketOutlined style={{ fontSize: 24, color: '#52c41a' }} />, title: '账单同步', desc: '自动同步 DeepSeek 官方账单' },
  { icon: <SafetyOutlined style={{ fontSize: 24, color: '#fa8c16' }} />, title: '多角色权限', desc: '管理员与普通用户分离' },
  { icon: <ThunderboltOutlined style={{ fontSize: 24, color: '#f5222d' }} />, title: 'DeepSeek 集成', desc: '原生对接 V4-Pro / V4-Flash 模型' },
  { icon: <MobileOutlined style={{ fontSize: 24, color: '#13c2c2' }} />, title: '多端适配', desc: 'H5 移动端 + 后台管理双端' },
]

function AdminLoginForm({ onSuccess }) {
  const [loading, setLoading] = useState(false)
  const [codeLoading, setCodeLoading] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [email, setEmail] = useState('')
  const timerRef = useRef(null)

  const startCountdown = () => {
    setCountdown(60)
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) { clearInterval(timerRef.current); return 0 }
        return prev - 1
      })
    }, 1000)
  }

  const handleSendCode = async () => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      message.warning('请输入正确的邮箱地址')
      return
    }
    setCodeLoading(true)
    try {
      await api.post('/auth/admin/send-code', { email })
      message.success({ content: `验证码已发送到 ${email}`, duration: 3 })
      startCountdown()
    } catch (e) {
      const detail = e.response?.data?.detail || '发送失败'
      if (detail.includes('未注册')) {
        message.error('该邮箱未注册为管理员')
      } else {
        message.error(detail)
      }
    } finally { setCodeLoading(false) }
  }

  const onFinish = async (values) => {
    setLoading(true)
    try {
      const res = await api.post('/auth/admin/login', { email: values.email, code: values.code })
      if (res.user?.role !== 'admin') {
        message.error('非管理员账号无法登录')
        return
      }
      localStorage.setItem('admin_token', res.access_token)
      localStorage.setItem('admin_user', JSON.stringify(res.user))
      localStorage.setItem('admin_login_time', Date.now().toString())
      message.success({ content: '✅ 管理员登录成功', duration: 2 })
      onSuccess()
    } catch (e) {
      const detail = e.response?.data?.detail || '登录失败'
      if (detail.includes('过期')) {
        message.warning('验证码已过期，请重新获取')
      } else {
        message.error(detail)
      }
    } finally { setLoading(false) }
  }

  return (
    <Form onFinish={onFinish} size="large" layout="vertical" initialValues={{ email: '' }}>
      <Form.Item name="email" label="管理员邮箱"
        rules={[{ required: true, message: '请输入邮箱' }, { type: 'email', message: '邮箱格式不正确' }]}
      >
        <Input prefix={<MailOutlined style={{ color: '#bfbfbf' }} />}
          placeholder="请输入管理员邮箱"
          style={{ borderRadius: 8, height: 44 }}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Form.Item>

      <Form.Item name="code" label="邮箱验证码"
        rules={[{ required: true, message: '请输入验证码' }, { len: 6, message: '验证码为6位数字' }]}
      >
        <div style={{ display: 'flex', gap: 8 }}>
          <Input prefix={<SafetyCertificateOutlined style={{ color: '#bfbfbf' }} />}
            placeholder="6位验证码" maxLength={6}
            style={{ borderRadius: 8, height: 44, flex: 1 }}
          />
          <Button onClick={handleSendCode} disabled={countdown > 0}
            loading={codeLoading}
            style={{ borderRadius: 8, height: 44, minWidth: 110,
              background: countdown > 0 ? '#f5f5f5' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              border: 'none', color: countdown > 0 ? '#999' : '#fff', fontWeight: 500 }}
          >
            {countdown > 0 ? `${countdown}s` : '获取验证码'}
          </Button>
        </div>
      </Form.Item>

      <Form.Item style={{ marginBottom: 12 }}>
        <Button type="primary" htmlType="submit" block loading={loading}
          style={{ height: 44, borderRadius: 8,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            border: 'none', fontSize: 15, fontWeight: 500,
            boxShadow: '0 4px 12px rgba(102,126,234,0.4)' }}
        >登录</Button>
      </Form.Item>
    </Form>
  )
}

function UserLoginForm({ onSuccess, defaultEmail }) {
  const [loading, setLoading] = useState(false)
  const [form] = Form.useForm()

  useEffect(() => {
    if (defaultEmail) {
      form.setFieldsValue({ email: defaultEmail })
    }
  }, [defaultEmail])

  const onFinish = async (values) => {
    setLoading(true)
    try {
      const res = await api.post('/auth/login', { account: values.email, password: values.password })
      localStorage.setItem('admin_token', res.access_token)
      localStorage.setItem('admin_user', JSON.stringify({ ...res.user, role: 'user' }))
      localStorage.setItem('admin_login_time', Date.now().toString())
      message.success({ content: '✅ 登录成功', duration: 2 })
      onSuccess()
    } catch (e) {
      message.error(e.response?.data?.detail || '登录失败')
    } finally { setLoading(false) }
  }

  return (
    <Form form={form} onFinish={onFinish} size="large" layout="vertical">
      <Form.Item name="email" label="邮箱"
        rules={[{ required: true, message: '请输入邮箱' }, { type: 'email', message: '邮箱格式不正确' }]}
      >
        <Input prefix={<MailOutlined style={{ color: '#bfbfbf' }} />}
          placeholder="请输入邮箱" style={{ borderRadius: 8, height: 44 }}
        />
      </Form.Item>
      <Form.Item name="password" label="密码"
        rules={[{ required: true, message: '请输入密码' }]}
      >
        <Input.Password prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
          placeholder="请输入密码" style={{ borderRadius: 8, height: 44 }}
        />
      </Form.Item>
      <Form.Item style={{ marginBottom: 12 }}>
        <Button type="primary" htmlType="submit" block loading={loading}
          style={{ height: 44, borderRadius: 8,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            border: 'none', fontSize: 15, fontWeight: 500,
            boxShadow: '0 4px 12px rgba(102,126,234,0.4)' }}
        >登录</Button>
      </Form.Item>
    </Form>
  )
}

function UserRegisterForm({ onRegistered }) {
  const [loading, setLoading] = useState(false)
  const [codeLoading, setCodeLoading] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [email, setEmail] = useState('')
  const timerRef = useRef(null)

  const startCountdown = () => {
    setCountdown(60)
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) { clearInterval(timerRef.current); return 0 }
        return prev - 1
      })
    }, 1000)
  }

  const handleSendCode = async () => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      message.warning('请输入正确的邮箱地址')
      return
    }
    setCodeLoading(true)
    try {
      await api.post('/auth/send-code', { email })
      message.success({ content: `验证码已发送到 ${email}`, duration: 3 })
      startCountdown()
    } catch (e) {
      message.error(e.response?.data?.detail || '发送失败')
    } finally { setCodeLoading(false) }
  }

  const onFinish = async (values) => {
    setLoading(true)
    try {
      await api.post('/auth/register', {
        email: values.email,
        code: values.code,
        nickname: values.nickname || '',
        password: values.password,
      })
      message.success({ content: '✅ 注册成功，自动跳转登录', duration: 2 })
      if (onRegistered) onRegistered(values.email)
    } catch (e) {
      message.error(e.response?.data?.detail || '注册失败')
    } finally { setLoading(false) }
  }

  return (
    <Form onFinish={onFinish} size="large" layout="vertical">
      <Form.Item name="email" label="邮箱"
        rules={[{ required: true, message: '请输入邮箱' }, { type: 'email', message: '邮箱格式不正确' }]}
      >
        <Input prefix={<MailOutlined style={{ color: '#bfbfbf' }} />}
          placeholder="请输入邮箱" style={{ borderRadius: 8, height: 44 }}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Form.Item>

      <Form.Item name="code" label="验证码"
        rules={[{ required: true, message: '请输入验证码' }, { len: 6, message: '验证码为6位数字' }]}
      >
        <div style={{ display: 'flex', gap: 8 }}>
          <Input prefix={<SafetyCertificateOutlined style={{ color: '#bfbfbf' }} />}
            placeholder="6位验证码" maxLength={6}
            style={{ borderRadius: 8, height: 44, flex: 1 }}
          />
          <Button onClick={handleSendCode} disabled={countdown > 0}
            loading={codeLoading}
            style={{ borderRadius: 8, height: 44, minWidth: 110,
              background: countdown > 0 ? '#f5f5f5' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              border: 'none', color: countdown > 0 ? '#999' : '#fff', fontWeight: 500 }}
          >
            {countdown > 0 ? `${countdown}s` : '获取验证码'}
          </Button>
        </div>
      </Form.Item>

      <Form.Item name="nickname" label="昵称">
        <Input prefix={<UserOutlined style={{ color: '#bfbfbf' }} />}
          placeholder="请输入昵称（选填）" style={{ borderRadius: 8, height: 44 }}
        />
      </Form.Item>

      <Form.Item name="password" label="密码"
        rules={[{ required: true, message: '请设置密码' }, { min: 6, message: '密码至少6位' }]}
      >
        <Input.Password prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
          placeholder="请设置密码（至少6位）" style={{ borderRadius: 8, height: 44 }}
        />
      </Form.Item>

      <Form.Item style={{ marginBottom: 12 }}>
        <Button type="primary" htmlType="submit" block loading={loading}
          style={{ height: 44, borderRadius: 8,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            border: 'none', fontSize: 15, fontWeight: 500,
            boxShadow: '0 4px 12px rgba(102,126,234,0.4)' }}
        >注册</Button>
      </Form.Item>
    </Form>
  )
}

export default function Login({ onLogin }) {
  const [activeTab, setActiveTab] = useState('user')
  const [registeredEmail, setRegisteredEmail] = useState('')

  const handleRegistered = (email) => {
    setRegisteredEmail(email)
    setActiveTab('user')
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0c0c2e 0%, #1a1a4e 30%, #2d1b69 60%, #667eea 100%)',
      position: 'relative',
      overflow: 'auto',
    }}>
      {/* 装饰背景 */}
      <div style={{
        position: 'fixed', top: '-20%', right: '-10%',
        width: 600, height: 600, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(102,126,234,0.15) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'fixed', bottom: '-15%', left: '-5%',
        width: 500, height: 500, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(118,75,162,0.2) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '60px 20px 40px', position: 'relative', zIndex: 1 }}>

        {/* ====== Hero / 产品介绍区 ====== */}
        <div style={{
          background: 'rgba(255,255,255,0.06)',
          backdropFilter: 'blur(12px)',
          borderRadius: 20,
          padding: '48px 40px',
          marginBottom: 32,
          textAlign: 'center',
          border: '1px solid rgba(255,255,255,0.08)',
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
            fontSize: 32, color: '#fff',
            boxShadow: '0 8px 24px rgba(102,126,234,0.4)',
          }}>
            <KeyOutlined />
          </div>
          <Title level={2} style={{ color: '#fff', margin: 0, fontSize: 32 }}>
            🚀 TokenManager
          </Title>
          <Paragraph style={{ color: 'rgba(255,255,255,0.85)', fontSize: 16, marginTop: 12, maxWidth: 600, margin: '12px auto 0' }}>
            轻量、高效的 AI Token 管理与用量监控平台
          </Paragraph>
          <Paragraph style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14, maxWidth: 600, margin: '8px auto 24px' }}>
            支持 DeepSeek 等多模型，实时统计消耗，智能充值，让每一分钱都花在刀刃上
          </Paragraph>

          {/* 核心功能卡片 */}
          <Row gutter={[16, 16]} style={{ maxWidth: 800, margin: '0 auto' }}>
            {features.map((f, i) => (
              <Col xs={12} md={8} key={i}>
                <div style={{
                  background: 'rgba(255,255,255,0.08)',
                  borderRadius: 12, padding: '16px 12px',
                  textAlign: 'center', height: '100%',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}>
                  <div style={{ marginBottom: 8 }}>{f.icon}</div>
                  <div style={{ color: '#fff', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{f.title}</div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>{f.desc}</div>
                </div>
              </Col>
            ))}
          </Row>
        </div>

        {/* ====== 登录/注册卡片 ====== */}
        <Card style={{
          maxWidth: 440, margin: '0 auto', borderRadius: 16,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          border: '1px solid rgba(255,255,255,0.1)',
          background: 'rgba(255,255,255,0.98)',
        }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <Title level={4} style={{ margin: 0 }}>开始使用</Title>
            <Text type="secondary">已有账号请登录，新用户请注册</Text>
          </div>

          <Tabs
            centered
            activeKey={activeTab}
            onChange={setActiveTab}
            items={[
              {
                key: 'user',
                label: '用户登录',
                children: <UserLoginForm onSuccess={onLogin} defaultEmail={registeredEmail} />,
              },
              {
                key: 'register',
                label: '用户注册',
                children: (
                  <>
                    <UserRegisterForm onRegistered={handleRegistered} />
                    <Alert message="注册后自动填入登录邮箱" type="info" showIcon
                      style={{ borderRadius: 8, fontSize: 12, marginTop: 8 }} />
                  </>
                ),
              },
              {
                key: 'admin',
                label: '管理员登录',
                children: (
                  <>
                    <AdminLoginForm onSuccess={onLogin} />
                    <Alert message="验证码将发送至您的管理员邮箱" type="info" showIcon
                      style={{ borderRadius: 8, fontSize: 12 }} />
                  </>
                ),
              },
            ]}
          />
        </Card>
      </div>
    </div>
  )
}
