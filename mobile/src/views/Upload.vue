<template>
  <div class="page">
    <div class="card" style="text-align:center;padding:24px;">
      <van-icon name="upload" size="48" color="#1989fa" />
      <h3 style="margin:8px 0;">文件上传</h3>
      <p style="color:#999;font-size:13px;">支持最大 500MB，仅管理员可上传</p>
    </div>

    <!-- 文件选择 -->
    <div class="card">
      <van-cell
        center
        @click="triggerFileInput"
        style="cursor:pointer;"
      >
        <template #title>
          <div>
            <van-icon name="friends-o" style="margin-right:8px;" />
            选择文件
          </div>
          <div v-if="selectedFile" style="font-size:13px;color:#666;margin-top:4px;">
            📎 {{ selectedFile.name }} ({{ (selectedFile.size / 1024 / 1024).toFixed(2) }} MB)
          </div>
        </template>
        <template #right-icon>
          <van-icon name="arrow" />
        </template>
      </van-cell>
      <input
        ref="fileInputRef"
        type="file"
        style="display:none"
        @change="onFileSelected"
      />

      <div style="padding:16px;">
        <van-button
          block
          round
          type="primary"
          :disabled="!selectedFile || uploading"
          :loading="uploading"
          @click="startUpload"
        >
          {{ uploading ? '上传中...' : '开始上传' }}
        </van-button>
      </div>

      <!-- 进度条 -->
      <div v-if="uploading" style="padding:0 16px 16px;">
        <van-progress
          :percentage="uploadProgress"
          :stroke-width="8"
          color="linear-gradient(90deg, #1989fa, #07c160)"
        />
        <p style="font-size:12px;color:#999;text-align:center;margin-top:6px;">
          {{ uploadProgress }}% ({{ uploadedMb }}MB / {{ totalMb }}MB)
        </p>
      </div>
    </div>

    <!-- 上传结果 -->
    <van-notify v-if="resultMsg" :type="resultType" />
    <div v-if="resultMsg" class="card" :style="{ border: `1px solid ${resultType === 'success' ? '#07c160' : '#ee0a24'}`, background: resultType === 'success' ? '#f0faf0' : '#fff0f0' }">
      <p style="font-size:14px;white-space:pre-wrap;">{{ resultMsg }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { showNotify } from 'vant'
import api from '../utils/api.js'

const fileInputRef = ref(null)
const selectedFile = ref(null)
const uploading = ref(false)
const uploadProgress = ref(0)
const uploadedMb = ref(0)
const totalMb = ref(0)
const resultMsg = ref('')
const resultType = ref('success')

function triggerFileInput() {
  fileInputRef.value?.click()
}

function onFileSelected(e) {
  const file = e.target.files?.[0]
  if (!file) return
  selectedFile.value = file
  resultMsg.value = ''
}

function startUpload() {
  if (!selectedFile.value || uploading.value) return

  const file = selectedFile.value
  const formData = new FormData()
  formData.append('file', file)

  uploading.value = true
  uploadProgress.value = 0
  totalMb.value = +(file.size / 1024 / 1024).toFixed(2)
  resultMsg.value = ''

  const token = localStorage.getItem('token') || ''

  const xhr = new XMLHttpRequest()
  xhr.open('POST', '/api/admin/upload')
  xhr.setRequestHeader('Authorization', `Bearer ${token}`)

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      const pct = Math.round((e.loaded / e.total) * 100)
      uploadProgress.value = pct
      uploadedMb.value = +(e.loaded / 1024 / 1024).toFixed(1)
    }
  }

  xhr.onload = () => {
    uploading.value = false
    if (xhr.status === 200) {
      const data = JSON.parse(xhr.responseText)
      resultType.value = 'success'
      resultMsg.value = `✅ 上传成功！\n${data.filename}\n${data.size_mb}MB\n已保存到服务器`
      showNotify({ type: 'success', message: '上传成功' })
      selectedFile.value = null
    } else {
      resultType.value = 'error'
      resultMsg.value = `❌ 上传失败 (${xhr.status})\n${xhr.responseText}`
      showNotify({ type: 'danger', message: '上传失败' })
    }
  }

  xhr.onerror = () => {
    uploading.value = false
    resultType.value = 'error'
    resultMsg.value = '❌ 网络错误，请重试'
    showNotify({ type: 'danger', message: '网络错误' })
  }

  xhr.send(formData)
}
</script>

<style scoped>
.page { padding-bottom: 80px; }
.card {
  background: #fff;
  border-radius: 12px;
  margin: 12px;
  overflow: hidden;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}
</style>
