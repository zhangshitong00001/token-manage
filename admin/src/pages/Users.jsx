import React, { useState, useEffect } from 'react'
import { Table, Button, Input, Space, Modal, Form, InputNumber, Select, Tag, message, Popconfirm } from 'antd'
import { SearchOutlined, DollarOutlined, ExclamationCircleOutlined } from '@ant-design/icons'
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
      await api.put(`/admin/users/${rechargeUser.id}`, { token_balance: rechargeAmount })
      message.success(`已将 ${rechargeUser.nickname} 的余额调整为 ${rechargeAmount.toLocaleString()}`)
      setRechargeModal(false)
      loadData()
    } catch (e) {
      message.error('操作失败')
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
            onClick={() => { setRechargeUser(r); setRechargeAmount(r.token_balance); setRechargeModal(true) }}>
            调余额
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

      <Modal
        title={`调整余额 - ${rechargeUser?.nickname}`}
        open={rechargeModal}
        onOk={handleRecharge}
        onCancel={() => setRechargeModal(false)}
      >
        <p>当前余额: <strong>{rechargeUser?.token_balance?.toLocaleString()}</strong> Token</p>
        <InputNumber
          style={{ width: '100%' }}
          value={rechargeAmount}
          onChange={setRechargeAmount}
          min={0}
          step={10000}
          formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
        />
        <p style={{ color: '#999', marginTop: 8, fontSize: 12 }}>直接设置为该额度（非增量调整）</p>
      </Modal>
    </div>
  )
}
