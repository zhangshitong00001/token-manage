import React, { useState, useRef } from 'react'
import {
  Upload, Button, Card, Typography, Progress, Alert,
  Space, Tag, message, Table,
} from 'antd'
import { UploadOutlined, InboxOutlined, FileZipOutlined, CloudUploadOutlined } from '@ant-design/icons'
import api from '../api'

const { Dragger } = Upload
const { Title, Text } = Typography

export default function UploadPage() {
  const [fileList, setFileList] = useState([])
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState(null)

  const handleUpload = async () => {
    if (fileList.length === 0) {
      message.warning('请先选择文件')
      return
    }
    const file = fileList[0]

    if (file.size > 500 * 1024 * 1024) {
      message.error('文件超过 500MB 上限')
      return
    }

    setUploading(true)
    setProgress(0)
    setResult(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await api.post('/admin/upload', formData, {
        timeout: 600000, // 500MB 上传最多 10 分钟
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (e.total) {
            setProgress(Math.round((e.loaded / e.total) * 100))
          }
        },
      })
      setResult({ type: 'success', data: res })
      message.success(`上传成功: ${res.filename}`)
      setFileList([])
    } catch (err) {
      const detail = err.response?.data?.detail || err.message
      setResult({ type: 'error', data: { detail } })
      message.error(`上传失败: ${detail}`)
    } finally {
      setUploading(false)
    }
  }

  const uploadProps = {
    name: 'file',
    multiple: false,
    accept: '.zip,.tar,.gz,.tgz,.py,.js,.ts,.vue,.jsx,.tsx,.json,.yaml,.yml,.txt,.md,.pdf,.doc,.docx',
    fileList,
    beforeUpload: (file) => {
      if (file.size > 500 * 1024 * 1024) {
        message.error('文件超过 500MB 上限')
        return Upload.LIST_IGNORE
      }
      setFileList([file])
      setResult(null)
      return false // 阻止自动上传
    },
    onRemove: () => {
      setFileList([])
      setResult(null)
    },
  }

  const columns = [
    {
      title: '文件名',
      dataIndex: 'filename',
      key: 'filename',
    },
    {
      title: '大小',
      dataIndex: 'size_mb',
      key: 'size_mb',
      render: (v) => `${v} MB`,
    },
    {
      title: '服务器路径',
      dataIndex: 'path',
      key: 'path',
      ellipsis: true,
    },
  ]

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <Title level={4}>
        <CloudUploadOutlined style={{ marginRight: 8, color: '#1677ff' }} />
        文件上传
      </Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
        支持上传 .zip / .tar.gz / 源码文件，最大 500MB。文件保存到服务器 /root/uploads/ 目录。
      </Text>

      <Card style={{ marginBottom: 24 }}>
        <Dragger {...uploadProps} disabled={uploading}>
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
          <p className="ant-upload-hint">
            支持 .zip .tar.gz .py .js .vue 等格式，单文件最大 500MB
          </p>
        </Dragger>

        {uploading && (
          <div style={{ marginTop: 20 }}>
            <Progress percent={progress} status="active" strokeColor={{ from: '#1677ff', to: '#52c41a' }} />
            <Text type="secondary" style={{ display: 'block', textAlign: 'center', marginTop: 4 }}>
              上传中 {progress}%
            </Text>
          </div>
        )}

        <Button
          type="primary"
          icon={<UploadOutlined />}
          onClick={handleUpload}
          disabled={fileList.length === 0 || uploading}
          loading={uploading}
          size="large"
          style={{ marginTop: 16, width: '100%' }}
        >
          {uploading ? '上传中...' : '上传到服务器'}
        </Button>
      </Card>

      {result && (
        <Alert
          type={result.type}
          showIcon
          message={result.type === 'success' ? '上传成功' : '上传失败'}
          description={
            result.type === 'success' ? (
              <div>
                <p><strong>文件名：</strong>{result.data.filename}</p>
                <p><strong>大小：</strong>{result.data.size_mb} MB</p>
                <p><strong>服务器路径：</strong><code>{result.data.path}</code></p>
              </div>
            ) : (
              <p>{result.data.detail}</p>
            )
          }
          style={{ marginBottom: 24 }}
        />
      )}

      <Card title="📂 已上传的文件" size="small">
        <Text type="secondary">点击下方按钮刷新文件列表</Text>
        <div style={{ marginTop: 12 }}>
          <Button size="small" onClick={async () => {
            try {
              const res = await api.get('/admin/uploads')
              if (res.files?.length) {
                Modal.info({
                  title: '已上传的文件',
                  width: 600,
                  content: (
                    <Table
                      dataSource={res.files}
                      columns={columns}
                      rowKey="filename"
                      pagination={false}
                      size="small"
                    />
                  ),
                })
              } else {
                message.info('暂无文件')
              }
            } catch { message.error('获取失败') }
          }}>
            刷新文件列表
          </Button>
        </div>
      </Card>
    </div>
  )
}
