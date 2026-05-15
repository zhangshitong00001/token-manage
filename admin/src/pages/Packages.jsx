import React, { useState, useEffect } from 'react'
import {
  Row, Col, Card, Button, Modal, Form, Input, InputNumber,
  message, Popconfirm, Tag, Space, Statistic, Badge, Tooltip,
  Typography, Divider, Empty, Spin,
} from 'antd'
import {
  PlusOutlined, EditOutlined, ArrowUpOutlined, ArrowDownOutlined,
  ThunderboltOutlined, FundOutlined, OrderedListOutlined,
  CheckCircleOutlined, MinusCircleOutlined, CrownOutlined,
  GiftOutlined, RocketOutlined, FireOutlined,
} from '@ant-design/icons'
import api from '../api'

const { Title, Text } = Typography

/** 根据价格分生成对应的图标和颜色 */
function getPackageStyle(priceCent) {
  if (priceCent <= 100) return { icon: <GiftOutlined />, color: '#52c41a', bg: 'linear-gradient(135deg, #f6ffed 0%, #d9f7be 100%)' }
  if (priceCent <= 1000) return { icon: <ThunderboltOutlined />, color: '#1890ff', bg: 'linear-gradient(135deg, #e6f7ff 0%, #bae7ff 100%)' }
  if (priceCent <= 10000) return { icon: <RocketOutlined />, color: '#722ed1', bg: 'linear-gradient(135deg, #f9f0ff 0%, #efdbff 100%)' }
  return { icon: <CrownOutlined />, color: '#fa8c16', bg: 'linear-gradient(135deg, #fff7e6 0%, #ffd591 100%)' }
}

/** 格式化 Token 数量 */
function formatTokens(amount) {
  if (amount >= 100000000) return (amount / 100000000).toFixed(1) + '亿'
  if (amount >= 10000) return (amount / 10000).toFixed(1) + '万'
  return amount.toLocaleString()
}

export default function Packages() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingPkg, setEditingPkg] = useState(null)
  const [form] = Form.useForm()

  const loadData = () => {
    setLoading(true)
    api.get('/admin/packages').then(setData).catch(console.error).finally(() => setLoading(false))
  }

  useEffect(() => { loadData() }, [])

  const openCreate = () => {
    setEditingPkg(null)
    form.resetFields()
    form.setFieldsValue({ sort_order: 99 })
    setModalVisible(true)
  }

  const openEdit = (record) => {
    setEditingPkg(record)
    form.setFieldsValue(record)
    setModalVisible(true)
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()
    try {
      if (editingPkg) {
        await api.put(`/admin/packages/${editingPkg.id}`, values)
        message.success({ content: '✅ 套餐编辑成功', duration: 2 })
      } else {
        await api.post('/admin/packages', values)
        message.success({ content: '✅ 套餐创建成功', duration: 2 })
      }
      setModalVisible(false)
      form.resetFields()
      loadData()
    } catch (e) {
      message.error(editingPkg ? '❌ 编辑失败' : '❌ 创建失败')
    }
  }

  const handleToggleActive = async (record) => {
    try {
      const newActive = record.is_active === 1 ? 0 : 1
      await api.put(`/admin/packages/${record.id}`, { is_active: newActive })
      message.success({
        content: newActive === 1 ? '✅ 套餐已恢复上架' : '⏸️ 套餐已下架',
        duration: 2,
      })
      loadData()
    } catch (e) {
      message.error('❌ 操作失败')
    }
  }

  const activeCount = data.filter(p => p.is_active === 1).length
  const inactiveCount = data.filter(p => p.is_active === 0).length

  return (
    <div style={{ padding: 0 }}>
      {/* 顶部统计 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card
            hoverable
            style={{
              borderRadius: 12,
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            }}
          >
            <Statistic
              title={<span style={{ color: 'rgba(255,255,255,0.8)' }}>套餐总数</span>}
              value={data.length}
              prefix={<FundOutlined style={{ color: '#fff' }} />}
              valueStyle={{ color: '#fff', fontWeight: 700 }}
              suffix={<span style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>个</span>}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card
            hoverable
            style={{
              borderRadius: 12,
              background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
            }}
          >
            <Statistic
              title={<span style={{ color: 'rgba(255,255,255,0.8)' }}>已上架</span>}
              value={activeCount}
              prefix={<CheckCircleOutlined style={{ color: '#fff' }} />}
              valueStyle={{ color: '#fff', fontWeight: 700 }}
              suffix={<span style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>个</span>}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card
            hoverable
            style={{
              borderRadius: 12,
              background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
            }}
          >
            <Statistic
              title={<span style={{ color: 'rgba(255,255,255,0.8)' }}>已下架</span>}
              value={inactiveCount}
              prefix={<MinusCircleOutlined style={{ color: '#fff' }} />}
              valueStyle={{ color: '#fff', fontWeight: 700 }}
              suffix={<span style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>个</span>}
            />
          </Card>
        </Col>
      </Row>

      {/* 操作栏 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <Title level={4} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <OrderedListOutlined /> 套餐列表
        </Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={openCreate}
          size="large"
          style={{
            borderRadius: 8,
            height: 42,
            boxShadow: '0 2px 8px rgba(24,144,255,0.35)',
          }}
        >
          新增套餐
        </Button>
      </div>

      {/* 套餐卡片网格 */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin size="large" />
        </div>
      ) : data.length === 0 ? (
        <Empty description="暂无套餐" />
      ) : (
        <Row gutter={[16, 16]}>
          {data.map((pkg) => {
            const style = getPackageStyle(pkg.price_cent)
            const isActive = pkg.is_active === 1
            return (
              <Col xs={24} sm={12} lg={8} xl={6} key={pkg.id}>
                <Badge.Ribbon
                  text={isActive ? '上架中' : '已下架'}
                  color={isActive ? 'green' : 'red'}
                >
                  <Card
                    hoverable
                    style={{
                      borderRadius: 12,
                      overflow: 'hidden',
                      transition: 'all 0.3s ease',
                      border: isActive
                        ? '1px solid #e8e8e8'
                        : '1px dashed #d9d9d9',
                      opacity: isActive ? 1 : 0.7,
                    }}
                    styles={{ body: { padding: 0 } }}
                  >
                    {/* 卡片头部渐变色 */}
                    <div
                      style={{
                        padding: '16px 20px',
                        background: isActive ? style.bg : 'linear-gradient(135deg, #f5f5f5 0%, #e8e8e8 100%)',
                        borderBottom: '1px solid #f0f0f0',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 20, color: style.color }}>{style.icon}</span>
                        <Text strong style={{ fontSize: 15, flex: 1 }}>{pkg.name}</Text>
                      </div>
                      <div style={{ fontSize: 13, color: '#888' }}>
                        ID: #{pkg.id} · 排序: {pkg.sort_order}
                      </div>
                    </div>

                    {/* Token 数量 */}
                    <div style={{ padding: '12px 20px', textAlign: 'center' }}>
                      <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>TOKEN 数量</div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: '#1a1a1a' }}>
                        {formatTokens(pkg.token_amount)}
                      </div>
                    </div>

                    {/* 价格 */}
                    <div
                      style={{
                        padding: '8px 20px',
                        background: '#fafafa',
                        borderTop: '1px solid #f0f0f0',
                        borderBottom: '1px solid #f0f0f0',
                        textAlign: 'center',
                      }}
                    >
                      <Text type="secondary" style={{ fontSize: 12 }}>售 价</Text>
                      <div>
                        <span style={{ fontSize: 14, color: '#999' }}>¥ </span>
                        <span style={{ fontSize: 26, fontWeight: 700, color: '#f5222d' }}>
                          {(pkg.price_cent / 100).toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {/* 操作按钮 */}
                    <div style={{ padding: '10px 16px', display: 'flex', justifyContent: 'center', gap: 8 }}>
                      <Tooltip title="编辑套餐信息">
                        <Button
                          size="small"
                          icon={<EditOutlined />}
                          onClick={() => openEdit(pkg)}
                          style={{ borderRadius: 6, minWidth: 70 }}
                        >
                          编辑
                        </Button>
                      </Tooltip>
                      <Popconfirm
                        title={isActive ? '确认下架该套餐？' : '确认上架该套餐？'}
                        description={isActive
                          ? '下架后用户将无法看到并购买此套餐'
                          : '上架后用户即可看到并购买此套餐'
                        }
                        onConfirm={() => handleToggleActive(pkg)}
                        okText="确认"
                        cancelText="取消"
                      >
                        <Tooltip title={isActive ? '下架套餐' : '上架套餐'}>
                          <Button
                            size="small"
                            danger={isActive}
                            type={isActive ? 'default' : 'primary'}
                            icon={isActive ? <ArrowDownOutlined /> : <ArrowUpOutlined />}
                            style={{ borderRadius: 6, minWidth: 70 }}
                          >
                            {isActive ? '下架' : '上架'}
                          </Button>
                        </Tooltip>
                      </Popconfirm>
                    </div>
                  </Card>
                </Badge.Ribbon>
              </Col>
            )
          })}
        </Row>
      )}

      {/* 编辑/新增弹窗 */}
      <Modal
        title={
          <Space>
            {editingPkg ? <EditOutlined style={{ color: '#1890ff' }} /> : <PlusOutlined style={{ color: '#52c41a' }} />}
            <span>{editingPkg ? '编辑套餐' : '新增套餐'}</span>
          </Space>
        }
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        okText={editingPkg ? '保存修改' : '立即创建'}
        cancelText="取消"
        width={480}
        destroyOnClose
        style={{ top: 80 }}
      >
        <Divider style={{ margin: '8px 0 20px' }} />
        <Form form={form} layout="vertical" size="large">
          <Form.Item
            name="name"
            label="套餐名称"
            rules={[{ required: true, message: '请输入套餐名称' }]}
          >
            <Input
              placeholder="例: 100万 Token 基础包"
              style={{ borderRadius: 8 }}
              prefix={<GiftOutlined style={{ color: '#bfbfbf' }} />}
            />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="token_amount"
                label="Token 数量"
                rules={[{ required: true, message: '请输入Token数量' }]}
              >
                <InputNumber
                  style={{ width: '100%', borderRadius: 8 }}
                  min={1000}
                  step={100000}
                  formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={(v) => v.replace(/,/g, '')}
                  placeholder="100000"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="price_cent"
                label="价格（分）"
                rules={[{ required: true, message: '请输入价格' }]}
              >
                <InputNumber
                  style={{ width: '100%', borderRadius: 8 }}
                  min={1}
                  formatter={(v) => `¥ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={(v) => v.replace(/[¥,\s]/g, '')}
                  placeholder="500"
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="sort_order" label="排序权重" extra="数字越小越靠前">
            <InputNumber
              style={{ width: '100%', borderRadius: 8 }}
              min={0}
              max={999}
              placeholder="99"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
