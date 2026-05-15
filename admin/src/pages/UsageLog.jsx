import React, { useState, useEffect } from 'react'
import { Table, Input, DatePicker, Space, Button } from 'antd'
import { SearchOutlined, DownloadOutlined } from '@ant-design/icons'
import api from '../api'
import dayjs from 'dayjs'

const { RangePicker } = DatePicker

export default function UsageLog() {
  const [data, setData] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [userId, setUserId] = useState('')
  const [dates, setDates] = useState(null)

  const loadData = (p = page) => {
    setLoading(true)
    const params = { page: p, page_size: 20 }
    if (userId) params.user_id = parseInt(userId)
    if (dates?.[0]) params.start_date = dates[0].format('YYYY-MM-DD')
    if (dates?.[1]) params.end_date = dates[1].format('YYYY-MM-DD')
    api.get('/admin/usage/list', { params }).then(res => {
      setData(res.items)
      setTotal(res.total)
    }).catch(console.error).finally(() => setLoading(false))
  }

  useEffect(() => { loadData() }, [])

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '用户ID', dataIndex: 'user_id', width: 80 },
    { title: 'Agent', dataIndex: 'agent_name' },
    { title: '输入Token', dataIndex: 'input_tokens', render: (v) => v?.toLocaleString() },
    { title: '输出Token', dataIndex: 'output_tokens', render: (v) => v?.toLocaleString() },
    { title: '消耗', dataIndex: 'total_cost', render: (v) => <strong>{v?.toLocaleString()}</strong> },
    { title: '请求ID', dataIndex: 'request_id', render: (v) => <code style={{ fontSize: 11 }}>{v?.slice(0, 20)}...</code> },
    { title: '时间', dataIndex: 'usage_time', render: (v) => dayjs(v).format('MM-DD HH:mm:ss') },
  ]

  const handleExport = () => {
    // Simple CSV export
    const headers = ['ID', '用户ID', 'Agent', '输入Token', '输出Token', '消耗', '请求ID', '时间']
    const rows = data.map(r => [r.id, r.user_id, r.agent_name, r.input_tokens, r.output_tokens, r.total_cost, r.request_id, r.usage_time])
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `usage_log_${dayjs().format('YYYYMMDD')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Input
          placeholder="用户ID"
          value={userId}
          onChange={e => setUserId(e.target.value)}
          style={{ width: 120 }}
        />
        <RangePicker value={dates} onChange={setDates} />
        <Button type="primary" icon={<SearchOutlined />} onClick={() => { setPage(1); loadData(1) }}>查询</Button>
        <Button icon={<DownloadOutlined />} onClick={handleExport}>导出CSV</Button>
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
