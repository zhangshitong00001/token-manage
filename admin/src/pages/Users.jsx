import React, { useState, useEffect } from 'react'
import { Table, Button, Input, Space, Modal, Form, InputNumber, Select, Tag, message, Popconfirm, Tabs, Drawer, List } from 'antd'
import { SearchOutlined, DollarOutlined, PlusOutlined, HistoryOutlined, ExclamationCircleOutlined } from '@ant-design/icons'
import api from '../api'
import dayjs from 'dayjs'

export default function Users() {
  const [data, setData] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [rechargeModal, setRechargeModal] = useState(false)
  const [rechargeUser, setRechargeUser] = useState(null)
  const [rechargeAmount, setRechargeAmount] = useState(0)
  const [rechargeMode, setRechargeMode] = useState('set') // set | add
  const [usageDrawer, setUsageDrawer] = useState(false)
  const [usageUser, setUsageUser] = useState(null)
  const [usageData, setUsageData] = useState(null)
  const [usageLoading, setUsageLoading] = useState(false)

  const loadData = (p = page) => {
    setLoading(true)
    const params = { page: p, page_size: 20 }
    if (keyword) params.keyword = keyword
    api.get('/admin/users', { params }).then(res => {
      setData(res.items)
      setTotal(res.total)
    }).catch(console.error).finally(() => setLoading(false))
  }

  useEffect(() => { loadData() }, [])

  const handleSearch = () => { setPage(1); loadData(1) }

  const handleRecharge = async () => {
    if (!rechargeAmount || rechargeAmount <= 0) return message.error('请输入有效数量')
    try {
      if (rechargeMode === 'set') {
        // 直接设置余额
        await api.put(`/admin/users/${rechargeUser.id}`, { token_balance: rechargeAmount })
        message.success(`已将 ${rechargeUser.nickname} 的余额设置为 ${rechargeAmount.toLocaleString()}`)
      } else {
        // 增量增加
        await api.post(`/admin/users/${rechargeUser.id}/add-tokens`, { amount: rechargeAmount })
        message.success(`已为 ${rechargeUser.nickname} 增加 ${rechargeAmount.toLocaleString()} Token`)
      }
      setRechargeModal(false)
      loadData()
    } catch (e) {
      message.error(e.response?.data?.detail || '操作失败')
    }
  }

  const toggleStatus = async (user) => {
    const newStatus = user.status === 1 ? 0 : 1
    try {
      await api.put(`/admin/users/${user.id}`, { status: newStatus })
      message.success(newStatus === 1 ? '已启用' : '已禁用')
      loadData()
    } catch (e) {
      message.error('操作失败')
    }
  }

  const openUsageDrawer = async (user) => {
    setUsageUser(user)
    setUsageDrawer(true)
    setUsageLoading(true)
    try {
      const res = await api.get(`/admin/users/${user.id}/quota-usage`, { params: { days: 30 } })
      setUsageData(res)
    } catch (e) {
      message.error('查询失败')
    } finally {
      setUsageLoading(false)
    }
  }

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '昵称', dataIndex: 'nickname' },
    { title: '手机号', dataIndex: 'phone', render: (v) => v ? v.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : '-' },
    { title: '邮箱', dataIndex: 'email', render: (v) => v ? v.replace(/(.{3}).+(@.+)/, '$1****$2') : '-' },
    { title: 'Token余额', dataIndex: 'token_balance', render: (v) => <strong>{v?.toLocaleString()}</strong> },
    { title: '角色', dataIndex: 'role', render: (v) => <Tag color={v === 'admin' ? 'red' : 'blue'}>{v}</Tag> },
    { title: '状态', dataIndex: 'status', render: (v) => <Tag color={v === 1 ? 'green' : 'red'}>{v === 1 ? '正常' : '禁用'}</Tag> },
    { title: '注册时间', dataIndex: 'created_at', render: (v) => dayjs(v).format('YYYY-MM-DD') },
    {
      title: '操作', render: (_, r) => (
        <Space>
          <Button size="small" icon={<DollarOutlined />}
            onClick={() => { setRechargeUser(r); setRechargeAmount(0); setRechargeMode('set'); setRechargeModal(true) }}>
            调余额
          </Button>
          <Button size="small" icon={<PlusOutlined />}
            onClick={() => { setRechargeUser(r); setRechargeAmount(10000); setRechargeMode('add'); setRechargeModal(true) }}>
            加Token
          </Button>
          <Button size="small" icon={<HistoryOutlined />}
            onClick={() => openUsageDrawer(r)}>
            消费
          </Button>
          <Popconfirm title={`确定${r.status === 1 ? '禁用' : '启用'}该用户？`} onConfirm={() => toggleStatus(r)}>
            <Button size="small" danger={r.status === 1}>{r.status === 1 ? '禁用' : '启用'}</Button>
          </Popconfirm>
        </Space>
      )
    },
  ]

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Input
          placeholder="搜索手机号/邮箱/昵称"
          prefix={<SearchOutlined />}
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          onPressEnter={handleSearch}
          style={{ width: 280 }}
        />
        <Button type="primary" onClick={handleSearch}>搜索</Button>
      </Space>

      <Table
        dataSource={data}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{ current: page, total, pageSize: 20, onChange: (p) => { setPage(p); loadData(p) } }}
        size="small"
      />

      {/* 调余额 / 加Token 弹窗 */}
      <Modal
        title={`${rechargeMode === 'set' ? '设置余额' : '增加Token'} - ${rechargeUser?.nickname || rechargeUser?.email}`}
        open={rechargeModal}
        onOk={handleRecharge}
        onCancel={() => setRechargeModal(false)}
      >
        <div style={{ marginBottom: 16 }}>
          <Tabs activeKey={rechargeMode} onChange={setRechargeMode} size="small"
            items={[
              { key: 'set', label: '设置余额（绝对值）' },
              { key: 'add', label: '增加Token（增量）' },
            ]}
          />
        </div>
        <p>
          当前余额: <strong style={{ color: '#1677ff' }}>{rechargeUser?.token_balance?.toLocaleString()}</strong> Token
        </p>
        {rechargeMode === 'add' && (
          <p style={{ color: '#999', fontSize: 12 }}>输入金额（元），将自动按 ¥1 = 10,000 Token 换算</p>
        )}
        <InputNumber
          style={{ width: '100%' }}
          value={rechargeAmount}
          onChange={setRechargeAmount}
          min={rechargeMode === 'set' ? 0 : 1}
          step={rechargeMode === 'add' ? 10 : 10000}
          formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
        />
        {rechargeMode === 'set' && (
          <p style={{ color: '#999', marginTop: 8, fontSize: 12 }}>直接设置为该额度（覆盖原有余额）</p>
        )}
        {rechargeMode === 'add' && rechargeAmount > 0 && (
          <p style={{ color: '#52c41a', marginTop: 8, fontSize: 13, fontWeight: 500 }}>
            将增加 {(rechargeAmount * 10000).toLocaleString()} Token，余额变为 {((rechargeUser?.token_balance || 0) + rechargeAmount * 10000).toLocaleString()}
          </p>
        )}
      </Modal>

      {/* 消耗记录抽屉 */}
      <Drawer
        title={`Token消耗记录 - ${usageUser?.nickname || usageUser?.email || usageUser?.id}`}
        placement="right"
        width={560}
        open={usageDrawer}
        onClose={() => setUsageDrawer(false)}
        loading={usageLoading}
      >
        {usageData && (
          <>
            <div style={{ marginBottom: 16, display: 'flex', gap: 16 }}>
              <div style={{ background: '#f0f5ff', padding: '12px 16px', borderRadius: 8, flex: 1 }}>
                <div style={{ color: '#999', fontSize: 12 }}>当前余额</div>
                <div style={{ fontSize: 20, fontWeight: 600, color: '#1677ff' }}>
                  {usageData.balance?.toLocaleString()}
                </div>
              </div>
              <div style={{ background: '#fff7e6', padding: '12px 16px', borderRadius: 8, flex: 1 }}>
                <div style={{ color: '#999', fontSize: 12 }}>近30天总消耗</div>
                <div style={{ fontSize: 20, fontWeight: 600, color: '#fa8c16' }}>
                  {usageData.total_deducted_tokens?.toLocaleString()}
                </div>
              </div>
              <div style={{ background: '#f6ffed', padding: '12px 16px', borderRadius: 8, flex: 1 }}>
                <div style={{ color: '#999', fontSize: 12 }}>调用次数</div>
                <div style={{ fontSize: 20, fontWeight: 600, color: '#52c41a' }}>
                  {usageData.total_records}
                </div>
              </div>
            </div>
            <List
              size="small"
              dataSource={usageData.records || []}
              renderItem={(item) => (
                <List.Item style={{ fontSize: 13 }}>
                  <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <Tag color={item.agent === 'chat' ? 'blue' : 'green'}>{item.agent}</Tag>
                      <span style={{ color: '#999' }}>{dayjs(item.time).format('MM-DD HH:mm')}</span>
                    </div>
                    <div>
                      <span style={{ color: '#666' }}>输入{Math.round(item.input_tokens / 1000)}k / 输出{Math.round(item.output_tokens / 1000)}k</span>
                      <span style={{ marginLeft: 12, color: '#fa8c16', fontWeight: 500 }}>-{item.deducted_tokens?.toLocaleString()}</span>
                    </div>
                  </div>
                </List.Item>
              )}
            />
          </>
        )}
      </Drawer>
    </div>
  )
}
