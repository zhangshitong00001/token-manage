import React, { useState, useEffect, useCallback, useRef } from 'react'
import { ConfigProvider, Layout, Menu, theme, Modal, Avatar, Dropdown, Space, Tag } from 'antd'
import {
  DashboardOutlined, UserOutlined, ShoppingCartOutlined,
  DollarOutlined, FileTextOutlined, SettingOutlined,
  LogoutOutlined, WarningOutlined, DownOutlined,
  SafetyOutlined, BarChartOutlined,
} from '@ant-design/icons'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Users from './pages/Users'
import Orders from './pages/Orders'
import Packages from './pages/Packages'
import PriceConfig from './pages/PriceConfig'
import UsageLog from './pages/UsageLog'
import SystemUsage from './pages/SystemUsage'
import api from './api'
import useIdleTimer from './useIdleTimer'

const { Header, Sider, Content } = Layout

const menuItems = [
  { key: '/admin/dashboard', icon: <DashboardOutlined />, label: '仪表盘' },
  { key: '/admin/users', icon: <UserOutlined />, label: '用户管理' },
  { key: '/admin/orders', icon: <ShoppingCartOutlined />, label: '订单管理' },
  { key: '/admin/packages', icon: <DollarOutlined />, label: '套餐管理' },
  { key: '/admin/price', icon: <SettingOutlined />, label: '价格配置' },
  { key: '/admin/usage', icon: <FileTextOutlined />, label: '消耗记录' },
  { key: '/admin/system-usage', icon: <BarChartOutlined />, label: '系统消耗' },
]

function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [sessionExpired, setSessionExpired] = useState(false)
  const modalShownRef = useRef(false)
  const token = localStorage.getItem('admin_token')
  const userStr = localStorage.getItem('admin_user')
  const user = userStr ? JSON.parse(userStr) : null

  // 弹窗：登录过期
  const showExpiredModal = useCallback(() => {
    if (modalShownRef.current) return
    modalShownRef.current = true
    setSessionExpired(true)
  }, [])

  // 关闭弹窗 + 重设计时
  const dismissModal = useCallback(() => {
    modalShownRef.current = false
    setSessionExpired(false)
  }, [])

  // ---- 空闲检测：10分钟无操作弹过期窗 ----
  const resetActivity = useIdleTimer(showExpiredModal, !!token)

  // ---- 心跳：每5分钟 ping 后台 ----
  useEffect(() => {
    if (!token) return
    const heartbeat = async () => {
      try { await api.get('/admin/ping') } catch (_) {}
    }
    heartbeat()
    const interval = setInterval(heartbeat, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [token])

  // ---- 路由切换 → 重置空闲计时 + 刷新后台 ----
  useEffect(() => {
    if (!token) return
    api.get('/admin/ping').catch(() => {})
    resetActivity()
  }, [location.pathname, token])

  // ---- 监听 session-expired 事件（api.jsx 401 拦截触发）----
  useEffect(() => {
    if (!token) return
    const handler = () => showExpiredModal()
    window.addEventListener('session-expired', handler)
    return () => window.removeEventListener('session-expired', handler)
  }, [token, showExpiredModal])

  // ---- 弹出过期弹窗 ----
  useEffect(() => {
    if (!sessionExpired) return
    Modal.confirm({
      title: '登录已过期',
      icon: <WarningOutlined style={{ color: '#faad14' }} />,
      content: '您已10分钟未操作，请重新登录',
      okText: '重新登录',
      cancelText: '再试一下',
      okButtonProps: { type: 'primary' },
      onOk: () => {
        window.location.reload()
      },
      onCancel: () => {
        dismissModal()
        resetActivity()
        api.get('/admin/ping').catch(() => {})
      },
    })
  }, [sessionExpired, dismissModal, resetActivity])

  if (!token) {
    return <Login onLogin={() => window.location.reload()} />
  }

  // 导航点击 → 重置空闲计时
  const handleMenuClick = ({ key }) => {
    resetActivity()
    api.get('/admin/ping').catch(() => {})
    navigate(key)
  }

  const handleLogout = () => {
    Modal.confirm({
      title: '确认退出',
      icon: <LogoutOutlined style={{ color: '#ff4d4f' }} />,
      content: '确定要退出管理后台吗？',
      okText: '退出',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        localStorage.removeItem('admin_token')
        localStorage.removeItem('admin_user')
        window.location.reload()
      },
    })
  }

  // 用户下拉菜单
  const userMenuItems = [
    {
      key: 'profile',
      icon: <SafetyOutlined />,
      label: (
        <span>
          {user?.phone?.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')}
          <Tag color="blue" style={{ marginLeft: 8, fontSize: 10 }}>管理员</Tag>
        </span>
      ),
      disabled: true,
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined style={{ color: '#ff4d4f' }} />,
      label: <span style={{ color: '#ff4d4f' }}>退出登录</span>,
      onClick: handleLogout,
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed} theme="dark">
        <div style={{
          height: 48, margin: 8, display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: '#fff', fontWeight: 'bold',
          fontSize: collapsed ? 14 : 16, whiteSpace: 'nowrap',
        }}>
          {collapsed ? 'TM' : 'TokenManager'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={handleMenuClick}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: '#fff',
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
            zIndex: 10,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16 }}>
            {menuItems.find(m => m.key === location.pathname)?.label || 'TokenManager'}
          </h2>
          <Space>
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={['click']}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  padding: '4px 12px',
                  borderRadius: 8,
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f5f5f5'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <Avatar
                  size={32}
                  icon={<UserOutlined />}
                  style={{
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  }}
                />
                <span style={{ color: '#333', fontWeight: 500 }}>
                  {user?.nickname || '管理员'}
                </span>
                <DownOutlined style={{ color: '#999', fontSize: 10 }} />
              </div>
            </Dropdown>
          </Space>
        </Header>
        <Content style={{ margin: 16, background: '#fff', borderRadius: 8, padding: 24, minHeight: 360 }}>
          <Routes>
            <Route path="/admin/dashboard" element={<Dashboard />} />
            <Route path="/admin/users" element={<Users />} />
            <Route path="/admin/orders" element={<Orders />} />
            <Route path="/admin/packages" element={<Packages />} />
            <Route path="/admin/price" element={<PriceConfig />} />
            <Route path="/admin/usage" element={<UsageLog />} />
            <Route path="/admin/system-usage" element={<SystemUsage />} />
            <Route path="*" element={<Dashboard />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  )
}

export default function App() {
  return (
    <ConfigProvider theme={{ algorithm: theme.defaultAlgorithm }}>
      <AppLayout />
    </ConfigProvider>
  )
}
