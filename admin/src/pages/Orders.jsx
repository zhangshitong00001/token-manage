import React, { useState, useEffect } from 'react'
import { Table, Tag, Select, Space, Button, message, Tooltip } from 'antd'
import { SyncOutlined, ReloadOutlined } from '@ant-design/icons'
import api from '../api'
import dayjs from 'dayjs'

const statusMap = {
  SUCCESS: { text: '充值成功', color: 'green' },
  CREATED: { text: '待处理', color: 'orange' },
  FAILED: { text: '充值失败', color: 'red' },
}
const methodLabels = { wechat: '微信支付', alipay: '支付宝', unionpay: '银联支付' }
const methodColors = { wechat: '#07c160', alipay: '#1677ff', unionpay: '#fa8c16' }
const methodIcons = { wechat: '💚', alipay: '🔵', unionpay: '💳' }

export default function Orders() {
  const [data, setData] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState(undefined)
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const loadData = (p = page) => {
    setLoading(true)
    const params = { page: p, page_size: 20 }
    if (statusFilter) params.status = statusFilter
    api.get('/admin/deepseek/invoices', { params }).then(res => {
      setData(res.items || [])
      setTotal(res.total || 0)
    }).catch(() => message.error('加载失败')).finally(() => setLoading(false))
  }

  useEffect(() => { loadData() }, [statusFilter])

  const onSync = async () => {
    setSyncing(true)
    try {
      const res = await api.post('/admin/deepseek/invoices/sync')
      message.success(res?.message || '同步成功')
      loadData()
    } catch (e) {
      message.error(e.response?.data?.detail || '同步失败')
    } finally {
      setSyncing(false)
    }
  }

  const columns = [
    {
      title: '支付方式', dataIndex: 'payment_method', width: 100,
      render: (v) => (
        <span>
          <span style={{ marginRight: 4 }}>{methodIcons[v] || '❓'}</span>
          {methodLabels[v] || v || '其他'}
        </span>
      ),
    },
    {
      title: '金额', dataIndex: 'amount', width: 80,
      render: (v) => <span style={{ fontWeight: 600, fontSize: 15 }}>¥{v}</span>,
    },
    {
      title: '状态', dataIndex: 'status', width: 100,
      render: (v) => {
        const s = statusMap[v]
        return s ? <Tag color={s.color}>{s.text}</Tag> : <Tag>{v}</Tag>
      },
    },
    {
      title: '支付时间', dataIndex: 'paid_at', width: 170,
      render: (v) => v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : <span style={{ color: '#999' }}>--</span>,
    },
    {
      title: '创建时间', dataIndex: 'inserted_at', width: 170,
      render: (v) => v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '--',
    },
    {
      title: '订单号', dataIndex: 'payment_order_id', width: 200,
      render: (v) => (
        <Tooltip title={v}>
          <code style={{ fontSize: 11, cursor: 'pointer' }}>{v}</code>
        </Tooltip>
      ),
    },
    {
      title: '同步时间', dataIndex: 'sync_at', width: 170,
      render: (v) => v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '--',
    },
  ]

  const totalYuan = data.reduce((s, r) => s + (r.amount || 0), 0)

  return (
    <div>
      <Space style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <Space>
          <span style={{ fontWeight: 500 }}>状态:</span>
          <Select
            allowClear placeholder="全部"
            style={{ width: 130 }}
            value={statusFilter}
            onChange={(v) => { setStatusFilter(v); setPage(1) }}
            options={[
              { value: 'SUCCESS', label: '充值成功' },
              { value: 'CREATED', label: '待处理' },
              { value: 'FAILED', label: '充值失败' },
            ]}
          />
          <span style={{ color: '#999', fontSize: 13 }}>
            共 {total} 条，当前页合计 <b style={{ color: '#667eea' }}>¥{totalYuan}</b>
          </span>
        </Space>
        <Space>
          <Button icon={<SyncOutlined />} onClick={onSync} loading={syncing}>
            {syncing ? '同步中...' : '同步 DeepSeek 账单'}
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => loadData(1)} loading={loading}>
            刷新
          </Button>
        </Space>
      </Space>
      <Table
        dataSource={data}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{
          current: page, total, pageSize: 20,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p) => { setPage(p); loadData(p) },
        }}
        size="small"
        scroll={{ x: 900 }}
      />
    </div>
  )
}
