import React, { useState, useRef } from 'react'
import { Form, Input, Button, Card, message, Typography } from 'antd'
import { MailOutlined, SafetyCertificateOutlined, LockOutlined, UserOutlined, ArrowLeftOutlined } from '@ant-design/icons'
import api from '../api'

const { Title, Text } = Typography

export default function Register({ onRegistered, onBack }) {
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
      message.success({ content: '✅ 注册成功！请登录', duration: 3 })
      if (onRegistered) onRegistered(values.email)
    } catch (e) {
      message.error(e.response?.data?.detail || '注册失败')
    } finally { setLoading(false) }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0c0c2e 0%, #1a1a4e 30%, #2d1b69 60%, #667eea 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, position: 'relative', overflow: 'auto',
    }}>
      {/* 装饰 */}
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

      <Card style={{
        maxWidth: 420, width: '100%', borderRadius: 16,
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        border: '1px solid rgba(255,255,255,0.1)',
        position: 'relative', zIndex: 1,
      }}>
        {/* 返回 */}
        <div style={{ marginBottom: 16 }}>
          <Button type="link" icon={<ArrowLeftOutlined />} onClick={onBack}
            style={{ color: '#667eea', padding: 0 }}
          >返回首页</Button>
        </div>

        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 12px', fontSize: 24, color: '#fff',
          }}>TM</div>
          <Title level={3} style={{ margin: 0 }}>注册账号</Title>
          <Text type="secondary">创建您的 TokenManager 账户</Text>
        </div>

        <Form onFinish={onFinish} size="large" layout="vertical">
          <Form.Item name="email" label="邮箱"
            rules={[{ required: true, message: '请输入邮箱' }, { type: 'email', message: '邮箱格式不正确' }]}
          >
            <Input prefix={<MailOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="请输入邮箱"
              style={{ borderRadius: 8, height: 44 }}
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

          <div style={{ textAlign: 'center' }}>
            <Text type="secondary">已有账号？</Text>
            <Button type="link" onClick={onBack}
              style={{ padding: '0 4px', color: '#667eea' }}
            >立即登录</Button>
          </div>
        </Form>
      </Card>
    </div>
  )
}
