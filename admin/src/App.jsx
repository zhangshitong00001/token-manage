import React, { useState, useEffect, useCallback, useRef } from 'react'
import { ConfigProvider, Layout, Menu, theme, Modal, Avatar, Dropdown, Space, Tag } from 'antd'
import {
  DashboardOutlined, UserOutlined, ShoppingCartOutlined,
  DollarOutlined, FileTextOutlined, SettingOutlined,
  LogoutOutlined, WarningOutlined, DownOutlined,
  SafetyOutlined, BarChartOutlined, CloudUploadOutlined,
  AppstoreOutlined, BuildOutlined,
} from '@ant-design/icons'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Users from './pages/Users'
import Orders from './pages/Orders'
import Packages from './pages/Packages'
import PriceConfig from './pages/PriceConfig'
import UsageLog from './pages/UsageLog'
import SystemUsage from './pages/SystemUsage'
import UploadPage from './pages/Upload'
import ClaudeTerminal from './pages/ClaudeTerminal'
import DataWorkspace from './pages/DataWorkspace'
import api from './api'
import useIdleTimer from './useIdleTimer'

const { Header, Sider, Content } = Layout

// 全部菜单项
const allMenuItems = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '仪表盘' },
  { key: '/users', icon: <UserOutlined />, label: '用户管理', adminOnly: true },
  { key: '/orders', icon: <ShoppingCartOutlined />, label: '订单管理', adminOnly: true },
  { key: '/packages', icon: <DollarOutlined />, label: '套餐管理', adminOnly: true },
  { key: '/price', icon: <SettingOutlined />, label: '价格配置', adminOnly: true },
  { key: '/usage', icon: <FileTextOutlined />, label: '消耗记录' },
  { key: '/system-usage', icon: <BarChartOutlined />, label: '系统消耗' },
  { key: '/upload', icon: <CloudUploadOutlined />, label: '文件上传' },
  { key: '/workspace', icon: <AppstoreOutlined />, label: '数据工作台' },
  { key: '/claude-terminal', icon: <BuildOutlined />, label: 'Claude Code 终端' },
]

function getFilteredMenus(isAdmin) {
  if (isAdmin) return allMenuItems
  return allMenuItems
    .filter(item => !item.adminOnly)
    .map(item => {
      if (item.children) {
        return { ...item, children: item.children.filter(c => !c.adminOnly) }
      }
      return item
    })
}

function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [sessionExpired, setSessionExpired] = useState(false)
  const modalShownRef = useRef(false)
  const token = localStorage.getItem('admin_token')
  const userStr = localStorage.getItem('admin_user')
  const user = userStr ? JSON.parse(userStr) : null
  const isAdmin = user?.role === 'admin'

  const menuItems = getFilteredMenus(isAdmin)

  const showExpiredModal = useCallback(() => {
    if (modalShownRef.current) return
    modalShownRef.current = true
    setSessionExpired(true)
  }, [])

  const dismissModal = useCallback(() => {
    modalShownRef.current = false
    setSessionExpired(false)
  }, [])

  const resetActivity = useIdleTimer(showExpiredModal, !!token)

  useEffect(() => {
    if (!token) return
    const heartbeat = async () => {
      try { await api.get('/admin/ping') } catch (_) {}
    }
    heartbeat()
    const interval = setInterval(heartbeat, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [token])

  useEffect(() => {
    if (!token) return
    api.get('/admin/ping').catch(() => {})
    resetActivity()
  }, [location.pathname, token])

  useEffect(() => {
    if (!token) return
    const handler = () => showExpiredModal()
    window.addEventListener('session-expired', handler)
    return () => window.removeEventListener('session-expired', handler)
  }, [token, showExpiredModal])

  useEffect(() => {
    if (!sessionExpired) return
    Modal.confirm({
      title: '登录已过期',
      icon: <WarningOutlined style={{ color: '#faad14' }} />,
      content: '您已10分钟未操作，请重新登录',
      okText: '重新登录',
      cancelText: '再试一下',
      okButtonProps: { type: 'primary' },
      onOk: () => { window.location.reload() },
      onCancel: () => {
        dismissModal()
        resetActivity()
        api.get('/admin/ping').catch(() => {})
      },
    })
  }, [sessionExpired, dismissModal, resetActivity])

  // 未登录 → 显示公开页面（根据路由决定显示哪个）
  if (!token) {
    const path = location.pathname
    if (path === '/login') return <Login onLogin={() => window.location.reload()} onBack={(to) => navigate(to === 'register' ? '/register' : '/')} />
    if (path === '/register') return <Register onRegistered={(email) => navigate('/login')} onBack={() => navigate('/login')} />
    // 默认显示 Landing 页
    return (
      <Landing
        onGoToLogin={() => navigate('/login')}
        onGoToRegister={() => navigate('/register')}
      />
    )
  }

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

  const userMenuItems = [
    {
      key: 'profile',
      icon: <SafetyOutlined />,
      label: (
        <span>
          {user?.phone?.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')}
          <Tag color="blue" style={{ marginLeft: 8, fontSize: 10 }}>{isAdmin ? '管理员' : '用户'}</Tag>
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
            {(() => {
              const flat = menuItems.reduce((acc, item) => {
                if (item.children) {
                  item.children.forEach(c => acc.push(c))
                } else {
                  acc.push(item)
                }
                return acc
              }, [])
              return flat.find(m => m.key === location.pathname)?.label || 'TokenManager'
            })()}
          </h2>
          <Space>
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={['click']}>
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  cursor: 'pointer', padding: '4px 12px', borderRadius: 8,
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f5f5f5'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <Avatar
                  size={32}
                  icon={<UserOutlined />}
                  style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
                />
                <span style={{ color: '#333', fontWeight: 500 }}>
                  {user?.nickname || '用户'}
                </span>
                <DownOutlined style={{ color: '#999', fontSize: 10 }} />
              </div>
            </Dropdown>
          </Space>
        </Header>
        <Content style={{ margin: 16, background: '#fff', borderRadius: 8, padding: 24, minHeight: 360 }}>
          <Routes>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/users" element={<Users />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/packages" element={<Packages />} />
            <Route path="/price" element={<PriceConfig />} />
            <Route path="/usage" element={<UsageLog />} />
            <Route path="/system-usage" element={<SystemUsage />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/workspace" element={<DataWorkspace />} />
            <Route path="/claude-terminal" element={<ClaudeTerminal />} />
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
