<template>
  <div class="page">
    <!-- 当前余额 -->
    <div class="balance-card" style="text-align:center;">
      <div class="label">当前余额</div>
      <div class="amount">{{ formatNumber(balance) }}</div>
      <div class="sub">选择套餐，快速充值 Token</div>
    </div>

    <!-- 套餐列表 -->
    <van-cell title="选择充值套餐" style="font-weight:600;border-radius:12px 12px 0 0;" />
    <van-radio-group v-model="selectedPkg" style="background:#fff;border-radius:0 0 12px 12px;margin-bottom:16px;">
      <van-cell-group :border="false">
        <van-cell
          v-for="pkg in packages"
          :key="pkg.id"
          clickable
          @click="selectedPkg = pkg.id"
        >
          <template #title>
            <span style="font-weight:500;">{{ pkg.name }}</span>
          </template>
          <template #label>
            <span style="color:#999;font-size:12px;">
              ¥{{ (pkg.price_cent / 100).toFixed(2) }}
            </span>
          </template>
          <template #value>
            <van-radio :name="pkg.id" />
          </template>
        </van-cell>
      </van-cell-group>
    </van-radio-group>

    <!-- 支付方式 -->
    <van-cell title="支付方式" style="font-weight:600;border-radius:12px 12px 0 0;" />
    <van-radio-group v-model="payMethod" style="background:#fff;border-radius:0 0 12px 12px;margin-bottom:24px;">
      <van-cell-group :border="false">
        <van-cell clickable @click="payMethod = 'wechat'">
          <template #title>
            <van-icon name="wechat" color="#07c160" style="margin-right:8px;" />
            微信支付
          </template>
          <template #value>
            <van-radio name="wechat" />
          </template>
        </van-cell>
        <van-cell clickable @click="payMethod = 'alipay'">
          <template #title>
            <van-icon name="alipay" color="#1989fa" style="margin-right:8px;" />
            支付宝
          </template>
          <template #value>
            <van-radio name="alipay" />
          </template>
        </van-cell>
      </van-cell-group>
    </van-radio-group>

    <!-- 充值按钮 -->
    <van-button
      type="primary"
      block
      round
      size="large"
      :disabled="!selectedPkg"
      :loading="submitting"
      @click="onRecharge"
    >
      立即充值
      <template v-if="selectedPkg">
        — ¥{{ getSelectedPrice() }}
      </template>
    </van-button>

    <!-- WebView 支付弹出层 -->
    <van-overlay :show="showPayment" @click="showPayment = false">
      <div style="position:absolute;bottom:0;left:0;right:0;background:#fff;border-radius:16px 16px 0 0;max-height:70vh;overflow-y:auto;">
        <div style="padding:20px;text-align:center;">
          <van-icon name="success" color="#07c160" size="48" />
          <h3 style="margin:12px 0;">支付模拟</h3>
          <p style="color:#999;">在微信内置浏览器中，这里会调起微信支付弹窗</p>
          <van-button type="success" block round style="margin-top:16px;" @click="mockPaySuccess">
            模拟支付成功
          </van-button>
          <van-button plain block round style="margin-top:8px;" @click="showPayment = false">
            取消
          </van-button>
        </div>
      </div>
    </van-overlay>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { showToast, showLoadingToast, closeToast } from 'vant'
import api, { logAction } from '../utils/api.js'

const packages = ref([])
const selectedPkg = ref(null)
const payMethod = ref('wechat')
const balance = ref(0)
const submitting = ref(false)
const showPayment = ref(false)
const currentOrder = ref(null)

function formatNumber(n) {
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿'
  if (n >= 10000) return (n / 10000).toFixed(1) + '万'
  return n.toLocaleString()
}

function getSelectedPrice() {
  const pkg = packages.value.find(p => p.id === selectedPkg.value)
  return pkg ? (pkg.price_cent / 100).toFixed(2) : '0.00'
}

async function onRecharge() {
  if (!selectedPkg.value) return
  submitting.value = true
  try {
    const res = await api.post('/order/create', {
      package_id: selectedPkg.value,
      pay_method: payMethod.value,
    })
    currentOrder.value = res.order
    const pkg = packages.value.find(p => p.id === selectedPkg.value)
    logAction('order_create', '/recharge', `创建充值订单: ${pkg?.name} | ¥${(pkg?.price_cent||0)/100} | ${payMethod.value}`)
    showPayment.value = true
  } catch (e) {
    logAction('order_failed', '/recharge', `创建订单失败: ${e.response?.data?.detail}`)
    showToast(e.response?.data?.detail || '创建订单失败')
  } finally {
    submitting.value = false
  }
}

async function mockPaySuccess() {
  showLoadingToast({ message: '支付处理中...', duration: 0 })
  try {
    const res = await api.post(`/order/pay/${currentOrder.value.order_no}`)
    showToast('支付成功！')
    showPayment.value = false
    logAction('payment_success', '/recharge', `支付成功: 订单 ${currentOrder.value?.order_no} | +${res.token_granted} Token`)
    const profile = await api.get('/user/profile')
    balance.value = profile.token_balance
  } catch (e) {
    logAction('payment_error', '/recharge', `支付处理异常: ${e.response?.data?.detail || e}`)
    showToast(e.response?.data?.detail || '支付处理异常')
  } finally {
    closeToast()
  }
}

onMounted(async () => {
  try {
    const [pkgData, profile] = await Promise.all([
      api.get('/packages'),
      api.get('/user/profile'),
    ])
    packages.value = pkgData
    balance.value = profile.token_balance
    if (pkgData.length) selectedPkg.value = pkgData[0].id
  } catch (e) {
    console.error(e)
  }
})
</script>
