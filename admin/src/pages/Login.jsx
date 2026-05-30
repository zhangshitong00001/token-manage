import React, { useState, useRef, useEffect } from 'react'
import { Form, Input, Button, Card, message, Typography, Alert, Modal } from 'antd'
import { MailOutlined, SafetyCertificateOutlined, LockOutlined, ArrowLeftOutlined } from '@ant-design/icons'
import api from '../api'

const { Title, Text } = Typography

// ---- 忘记密码弹窗 ----
function ForgotPasswordModal({ visible, onClose }) {
  const [step, setStep] = useState('send')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [codeLoading, setCodeLoading] = useState(false)
  const [countdown, setCountdown] = useState(0)
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
      await api.post('/auth/forgot-password/send-code', { email })
      message.success({ content: `验证码已发送到 ${email}`, duration: 3 })
      startCountdown()
    } catch (e) {
      message.error(e.response?.data?.detail || '发送失败')
    } finally { setCodeLoading(false) }
  }

  const handleReset = async () => {
    if (!code || code.length !== 6) { message.warning('请输入6位验证码'); return }
    if (!newPassword || newPassword.length < 6) { message.warning('密码至少6位'); return }
    if (newPassword !== confirmPassword) { message.warning('两次密码输入不一致'); return }
    setLoading(true)
    try {
      await api.post('/auth/forgot-password/reset', { email, code, new_password: newPassword })
      message.success({ content: '✅ 密码重置成功，请使用新密码登录', duration: 3 })
      setStep('done')
    } catch (e) {
      message.error(e.response?.data?.detail || '重置失败')
    } finally { setLoading(false) }
  }

  const handleClose = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    setEmail(''); setCode(''); setNewPassword(''); setConfirmPassword('')
    setCountdown(0); setStep('send'); onClose()
  }

  const inputStyle = { borderRadius: 8, height: 44 }

  return (
    <Modal title="🔑 忘记密码" open={visible} onCancel={handleClose} footer={null} destroyOnClose width={420} centered>
      {step === 'send' && (
        <Form layout="vertical" size="large">
          <Form.Item label="邮箱" required>
            <Input prefix={<MailOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="请输入注册时使用的邮箱" value={email}
              onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
          </Form.Item>
          <Form.Item label="邮箱验证码" required>
            <div style={{ display: 'flex', gap: 8 }}>
              <Input prefix={<SafetyCertificateOutlined style={{ color: '#bfbfbf' }} />}
                placeholder="6位验证码" maxLength={6} value={code}
                onChange={(e) => setCode(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
              <Button onClick={handleSendCode} disabled={countdown > 0} loading={codeLoading}
                style={{ borderRadius: 8, height: 44, minWidth: 110,
                  background: countdown > 0 ? '#f5f5f5' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  border: 'none', color: countdown > 0 ? '#999' : '#fff', fontWeight: 500 }}>
                {countdown > 0 ? `${countdown}s` : '获取验证码'}
              </Button>
            </div>
          </Form.Item>
          <Form.Item label="新密码" required>
            <Input.Password prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="请输入新密码（至少6位）" value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)} style={inputStyle} />
          </Form.Item>
          <Form.Item label="确认密码" required>
            <Input.Password prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="请再次输入新密码" value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)} style={inputStyle} />
          </Form.Item>
          <Button type="primary" block loading={loading} onClick={handleReset}
            style={{ height: 44, borderRadius: 8,
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', border: 'none',
              fontSize: 15, fontWeight: 500, boxShadow: '0 4px 12px rgba(102,126,234,0.4)' }}
          >重置密码</Button>
        </Form>
      )}
      {step === 'done' && (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <Title level={4} style={{ margin: 0 }}>密码已重置</Title>
          <Text type="secondary" style={{ marginTop: 8, display: 'block' }}>请使用新密码登录后台</Text>
          <Button type="primary" onClick={handleClose}
            style={{ height: 44, borderRadius: 8, marginTop: 16,
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', border: 'none',
              fontSize: 15, fontWeight: 500 }}
          >返回登录</Button>
        </div>
      )}
    </Modal>
  )
}

// ---- 用户邮箱密码登录 ----
function UserLoginForm({ onSuccess, onOpenForgotPassword }) {
  const [loading, setLoading] = useState(false)
  const [form] = Form.useForm()

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
          placeholder="请输入邮箱" style={{ borderRadius: 8, height: 44 }} />
      </Form.Item>
      <Form.Item name="password" label="密码"
        rules={[{ required: true, message: '请输入密码' }]}
      >
        <Input.Password prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
          placeholder="请输入密码" style={{ borderRadius: 8, height: 44 }} />
      </Form.Item>
      <div style={{ textAlign: 'right', marginTop: -12, marginBottom: 12 }}>
        <Button type="link" style={{ padding: 0, fontSize: 13, color: '#667eea' }}
          onClick={onOpenForgotPassword}
        >忘记密码？</Button>
      </div>
      <Form.Item style={{ marginBottom: 8 }}>
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

// ---- 管理员邮箱验证码登录 ----
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
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { message.warning('请输入正确的邮箱地址'); return }
    setCodeLoading(true)
    try {
      await api.post('/auth/admin/send-code', { email })
      message.success({ content: `验证码已发送到 ${email}`, duration: 3 })
      startCountdown()
    } catch (e) {
      const detail = e.response?.data?.detail || '发送失败'
      message.error(detail.includes('未注册') ? '该邮箱未注册为管理员' : detail)
    } finally { setCodeLoading(false) }
  }

  const onFinish = async (values) => {
    setLoading(true)
    try {
      const res = await api.post('/auth/admin/login', { email: values.email, code: values.code })
      if (res.user?.role !== 'admin') { message.error('非管理员账号无法登录'); return }
      localStorage.setItem('admin_token', res.access_token)
      localStorage.setItem('admin_user', JSON.stringify(res.user))
      localStorage.setItem('admin_login_time', Date.now().toString())
      message.success({ content: '✅ 管理员登录成功', duration: 2 })
      onSuccess()
    } catch (e) {
      const detail = e.response?.data?.detail || '登录失败'
      message.error(detail.includes('过期') ? '验证码已过期，请重新获取' : detail)
    } finally { setLoading(false) }
  }

  return (
    <Form onFinish={onFinish} size="large" layout="vertical" initialValues={{ email: '' }}>
      <Form.Item name="email" label="管理员邮箱"
        rules={[{ required: true, type: 'email' }]}
      >
        <Input prefix={<MailOutlined style={{ color: '#bfbfbf' }} />}
          placeholder="请输入管理员邮箱" style={{ borderRadius: 8, height: 44 }}
          onChange={(e) => setEmail(e.target.value)} />
      </Form.Item>
      <Form.Item name="code" label="邮箱验证码"
        rules={[{ required: true, message: '请输入验证码' }, { len: 6, message: '验证码为6位数字' }]}
      >
        <div style={{ display: 'flex', gap: 8 }}>
          <Input prefix={<SafetyCertificateOutlined style={{ color: '#bfbfbf' }} />}
            placeholder="6位验证码" maxLength={6} style={{ borderRadius: 8, height: 44, flex: 1 }} />
          <Button onClick={handleSendCode} disabled={countdown > 0} loading={codeLoading}
            style={{ borderRadius: 8, height: 44, minWidth: 110,
              background: countdown > 0 ? '#f5f5f5' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              border: 'none', color: countdown > 0 ? '#999' : '#fff', fontWeight: 500 }}>
            {countdown > 0 ? `${countdown}s` : '获取验证码'}
          </Button>
        </div>
      </Form.Item>
      <Form.Item style={{ marginBottom: 8 }}>
        <Button type="primary" htmlType="submit" block loading={loading}
          style={{ height: 44, borderRadius: 8,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            border: 'none', fontSize: 15, fontWeight: 500,
            boxShadow: '0 4px 12px rgba(102,126,234,0.4)' }}
        >管理员登录</Button>
      </Form.Item>
    </Form>
  )
}

// ---- 主登录页 ----
export default function Login({ onLogin, onBack }) {
  const [isAdmin, setIsAdmin] = useState(false)
  const [forgotPwdVisible, setForgotPwdVisible] = useState(false)

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
        {/* 返回首页 */}
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Button type="link" icon={<ArrowLeftOutlined />} onClick={onBack}
            style={{ color: '#667eea', padding: 0 }}
          >返回首页</Button>
          <Button type="link" onClick={() => setIsAdmin(!isAdmin)}
            style={{ color: '#999', padding: 0, fontSize: 12 }}
          >{isAdmin ? '用户登录' : '管理员登录'}</Button>
        </div>

        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 12px', fontSize: 24, color: '#fff',
          }}>TM</div>
          <Title level={3} style={{ margin: 0 }}>{isAdmin ? '管理员登录' : '用户登录'}</Title>
          <Text type="secondary" style={{ marginTop: 4, display: 'block' }}>
            {isAdmin ? '请输入管理员邮箱及验证码' : '使用邮箱和密码登录'}
          </Text>
        </div>

        {isAdmin ? (
          <AdminLoginForm onSuccess={onLogin} />
        ) : (
          <UserLoginForm onSuccess={onLogin}
            onOpenForgotPassword={() => setForgotPwdVisible(true)} />
        )}

        {!isAdmin && (
          <Alert message="还没有账号？" type="info" showIcon
            style={{ borderRadius: 8, fontSize: 12, marginTop: 8 }}
            action={
              <Button size="small" type="link" onClick={() => onBack && onBack('register')}
                style={{ color: '#667eea', fontWeight: 500, padding: 0 }}
              >去注册</Button>
            }
          />
        )}
      </Card>

      <ForgotPasswordModal visible={forgotPwdVisible} onClose={() => setForgotPwdVisible(false)} />
    </div>
  )
}
