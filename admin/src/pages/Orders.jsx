import React, { useState, useEffect } from 'react'
import { Table, Tag, Select, Space, Button, message } from 'antd'
import { CheckCircleOutlined } from '@ant-design/icons'
import api from '../api'
import dayjs from 'dayjs'

export default function Orders() {
  const [data, setData] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState(null)
  const [loading, setLoading] = useState(false)

  const loadData = (p = page) => {
    setLoading(true)
    const params = { page: p, page_size: 20 }
    if (statusFilter !== null) params.pay_status = statusFilter
    api.get('/admin/orders', { params }).then(res => {
      setData(res.items)
      setTotal(res.total)
    }).catch(console.error).finally(() => setLoading(false))
  }

  useEffect(() => { loadData() }, [statusFilter])

  const confirmPayment = async (order) => {
    try {
      await api.post(`/order/admin-confirm/${order.order_no}`)
      message.success(`已确认支付，到账 ${order.token_granted.toLocaleString()} Token`)
      loadData()
    } catch (e) {
      message.error(e.response?.data?.detail || '操作失败')
    }
  }

  const statusMap = { 0: { text: '待支付', color: 'orange' }, 1: { text: '已支付', color: 'green' }, 2: { text: '失败', color: 'red' }, 3: { text: '已退款', color: 'gray' } }

  const columns = [
    { title: '订单号', dataIndex: 'order_no', width: 180 },
    { title: '用户ID', dataIndex: 'user_id' },
    { title: '金额', dataIndex: 'amount_cent', render: (v) => `¥${(v / 100).toFixed(2)}` },
    { title: 'Token', dataIndex: 'token_granted', render: (v) => v?.toLocaleString() },
    { title: '支付方式', dataIndex: 'pay_method', render: (v) => v === 'wechat' ? '微信' : '支付宝' },
    { title: '状态', dataIndex: 'pay_status', render: (v) => <Tag color={statusMap[v]?.color}>{statusMap[v]?.text}</Tag> },
    { title: '支付时间', dataIndex: 'pay_time', render: (v) => v ? dayjs(v).format('MM-DD HH:mm') : '-' },
    { title: '创建时间', dataIndex: 'create_time', render: (v) => dayjs(v).format('MM-DD HH:mm') },
    {
      title: '操作', render: (_, r) =>
        r.pay_status === 0 ? (
          <Button type="primary" size="small" icon={<CheckCircleOutlined />} onClick={() => confirmPayment(r)}>
            确认支付
          </Button>
        ) : (
          <Tag color="green">已完成</Tag>
        )
    },
  ]

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <span>状态筛选:</span>
        <Select
          allowClear
          placeholder="全部"
          style={{ width: 120 }}
          value={statusFilter}
          onChange={(v) => { setStatusFilter(v); setPage(1) }}
          options={[
            { value: 0, label: '待支付' },
            { value: 1, label: '已支付' },
            { value: 2, label: '失败' },
            { value: 3, label: '已退款' },
          ]}
        />
      </Space>
      <Table
        dataSource={data}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{ current: page, total, pageSize: 20, onChange: (p) => { setPage(p); loadData(p) } }}
        size="small"
      />
    </div>
  )
}
