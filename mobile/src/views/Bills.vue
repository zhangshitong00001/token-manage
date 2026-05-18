<template>
  <div class="page">
    <!-- 同步按钮 -->
    <div style="padding:12px 16px;">
      <van-button
        block round size="small"
        :loading="syncing"
        @click="onSync"
        style="border:1px solid #667eea;color:#667eea;background:transparent;"
      >
        {{ syncing ? '同步中...' : '⇅ 同步 DeepSeek 账单' }}
      </van-button>
      <div v-if="syncMsg" style="text-align:center;font-size:12px;color:#999;margin-top:6px;">{{ syncMsg }}</div>
    </div>

    <!-- 状态筛选 -->
    <van-tabs v-model:active="statusFilter" @change="loadInvoices" style="margin-bottom:8px;">
      <van-tab title="全部" name="" />
      <van-tab title="已成功" name="SUCCESS" />
      <van-tab title="处理中" name="CREATED" />
      <van-tab title="已失败" name="FAILED" />
    </van-tabs>

    <!-- 账单列表 -->
    <van-pull-refresh v-model="refreshing" @refresh="onSync">
      <template v-if="items.length">
        <div v-for="item in items" :key="item.id" style="margin:0 16px 10px;background:#fff;border-radius:12px;padding:14px 16px;box-shadow:0 1px 4px rgba(0,0,0,0.04);">
          <!-- 第一行：支付方式 + 金额 -->
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <van-icon
                :name="methodIcon(item.payment_method)"
                :color="methodColor(item.payment_method)"
                size="20"
              />
              <span style="font-size:14px;font-weight:500;">{{ methodLabel(item.payment_method) }}</span>
            </div>
            <div>
              <span style="font-size:20px;font-weight:700;color:#333;">¥</span>
              <span style="font-size:20px;font-weight:700;color:#333;">{{ item.amount }}</span>
            </div>
          </div>
          <!-- 第二行：状态 + 时间 -->
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <van-tag :type="statusType(item.status)" size="small" round>
              {{ statusLabel(item.status) }}
            </van-tag>
            <span style="font-size:12px;color:#999;">{{ formatTime(item.paid_at || item.inserted_at) }}</span>
          </div>
          <!-- 订单号（展开用） -->
          <div style="font-size:11px;color:#ccc;margin-top:6px;word-break:break-all;">{{ item.payment_order_id }}</div>
        </div>

        <!-- 加载更多 -->
        <div v-if="hasMore" style="text-align:center;padding:12px;">
          <van-button plain size="small" round @click="loadMore" :loading="loadingMore">加载更多</van-button>
        </div>
        <div v-else-if="items.length > 0" style="text-align:center;padding:16px;font-size:12px;color:#ccc;">— 没有更多了 —</div>
      </template>

      <template v-else-if="!loading">
        <div style="text-align:center;padding:60px 20px;color:#ccc;">
          <van-icon name="bill-o" size="48" style="color:#e8e8e8;" />
          <p style="margin-top:12px;">暂无账单记录</p>
          <p style="font-size:12px;">点击上方按钮同步 DeepSeek 平台数据</p>
        </div>
      </template>
    </van-pull-refresh>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { showToast } from 'vant'
import api from '../utils/api.js'

const items = ref([])
const loading = ref(false)
const loadingMore = ref(false)
const syncing = ref(false)
const refreshing = ref(false)
const syncMsg = ref('')
const statusFilter = ref('')
const page = ref(1)
const pageSize = 20
const total = ref(0)

const hasMore = ref(false)

function methodIcon(method) {
  const map = { wechat: 'wechat', alipay: 'alipay', unionpay: 'bank-card-o' }
  return map[method] || 'balance-o'
}
function methodColor(method) {
  const map = { wechat: '#07c160', alipay: '#1677ff', unionpay: '#fa8c16' }
  return map[method] || '#999'
}
function methodLabel(method) {
  const map = { wechat: '微信支付', alipay: '支付宝', unionpay: '银联支付' }
  return map[method] || '其他'
}
function statusType(status) {
  const map = { SUCCESS: 'success', CREATED: 'warning', FAILED: 'danger' }
  return map[status] || 'default'
}
function statusLabel(status) {
  const map = { SUCCESS: '充值成功', CREATED: '待处理', FAILED: '充值失败' }
  return map[status] || status
}
function formatTime(t) {
  if (!t) return '--'
  try {
    const d = new Date(t)
    // 转为北京时间 (UTC+8)
    const opts = { hour12: false, timeZone: 'Asia/Shanghai',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit' }
    return d.toLocaleString('zh-CN', opts).replace(/\//g, '-')
  } catch {
    return t
  }
}

async function loadInvoices() {
  loading.value = true
  page.value = 1
  try {
    const res = await api.get('/mobile/deepseek/invoices', {
      params: { page: page.value, page_size: pageSize, status: statusFilter.value },
    })
    items.value = res.items || []
    total.value = res.total || 0
    hasMore.value = items.value.length < total.value
  } catch (e) {
    showToast('加载失败')
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  if (loadingMore.value) return
  loadingMore.value = true
  page.value += 1
  try {
    const res = await api.get('/mobile/deepseek/invoices', {
      params: { page: page.value, page_size: pageSize, status: statusFilter.value },
    })
    items.value = [...items.value, ...(res.items || [])]
    hasMore.value = items.value.length < (res.total || 0)
  } catch {
    page.value -= 1
    showToast('加载更多失败')
  } finally {
    loadingMore.value = false
  }
}

async function onSync() {
  syncing.value = true
  syncMsg.value = ''
  try {
    const res = await api.post('/mobile/deepseek/invoices/sync')
    syncMsg.value = res.message || '同步完成'
    showToast('同步成功')
    await loadInvoices()
  } catch (e) {
    syncMsg.value = '同步失败: ' + (e.response?.data?.detail || e.message)
  } finally {
    syncing.value = false
    refreshing.value = false
  }
}

onMounted(async () => {
  // 先加载本地数据，后台悄悄同步
  await loadInvoices()
  // 静默同步（不弹 Toast，只更新数据）
  try {
    const res = await api.post('/mobile/deepseek/invoices/sync')
    syncMsg.value = res.message || ''
    await loadInvoices()
  } catch {
    // 静默失败不打扰用户
  }
})
</script>

<style scoped>
.page {
  min-height: 80vh;
  background: #f7f8fa;
  padding-bottom: 20px;
}
</style>
