import React, { useState, useEffect } from 'react'
import { Card, Form, InputNumber, Button, message, Spin, Descriptions } from 'antd'
import api from '../api'

export default function PriceConfig() {
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  useEffect(() => {
    api.get('/admin/price-config').then(res => {
      setConfig(res)
      form.setFieldsValue(res)
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    const values = await form.validateFields()
    try {
      await api.put('/admin/price-config', values)
      message.success('价格配置已更新')
      setConfig(values)
    } catch (e) {
      message.error('更新失败')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Spin size="large" style={{ display: 'block', textAlign: 'center' }} />

  return (
    <div>
      <Descriptions title="当前定价" column={2} style={{ marginBottom: 24 }}>
        <Descriptions.Item label="每千输入Token">
          ¥{config?.input_price_per_k?.toFixed(6)}
        </Descriptions.Item>
        <Descriptions.Item label="每千输出Token">
          ¥{config?.output_price_per_k?.toFixed(6)}
        </Descriptions.Item>
      </Descriptions>

      <Card title="修改定价">
        <Form form={form} layout="vertical" style={{ maxWidth: 400 }}>
          <Form.Item name="input_price_per_k" label="每千输入Token价格（元）" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={0} step={0.0001} precision={6} />
          </Form.Item>
          <Form.Item name="output_price_per_k" label="每千输出Token价格（元）" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={0} step={0.0001} precision={6} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" onClick={handleSave} loading={saving}>
              保存配置
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}
