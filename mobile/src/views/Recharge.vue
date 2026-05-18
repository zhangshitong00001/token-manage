<template>
  <div class="page">
    <!-- Token 余额 -->
    <div class="balance-card" style="text-align:center;">
      <div class="label">当前 Token 余额</div>
      <div class="amount">{{ formatNumber(balance) }}</div>
      <div class="sub" style="margin-top:4px;">
        DeepSeek 余额: ¥{{ dsBalance?.cny_balance?.toFixed(2) || '--' }}
      </div>
    </div>

    <!-- 切换：Token充值 / DeepSeek充值 -->
    <van-tabs v-model:active="tabActive" sticky @change="onTabChange">
      <van-tab title="Token 充值">
        <!-- 套餐列表 -->
        <van-cell title="选择充值套餐" style="font-weight:600;border-radius:12px 12px 0 0;margin-top:12px;" />
        <van-radio-group v-model="selectedPkg" style="background:#fff;border-radius:0 0 12px 12px;margin-bottom:12px;">
          <van-cell-group :border="false">
            <van-cell
              v-for="pkg in packages" :key="pkg.id" clickable
              @click="selectedPkg = pkg.id"
            >
              <template #title>
                <span style="font-weight:500;">{{ pkg.name }}</span>
              </template>
              <template #label>
                <span style="color:#999;font-size:12px;">¥{{ (pkg.price_cent / 100).toFixed(2) }}</span>
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
              <template #title><van-icon name="wechat" color="#07c160" style="margin-right:8px;" />微信支付</template>
              <template #value><van-radio name="wechat" /></template>
            </van-cell>
            <van-cell clickable @click="payMethod = 'alipay'">
              <template #title><van-icon name="alipay" color="#1989fa" style="margin-right:8px;" />支付宝</template>
              <template #value><van-radio name="alipay" /></template>
            </van-cell>
          </van-cell-group>
        </van-radio-group>

        <van-button type="primary" block round size="large" :disabled="!selectedPkg" :loading="submitting" @click="onRecharge">
          立即充值 <template v-if="selectedPkg">— ¥{{ getSelectedPrice() }}</template>
        </van-button>
      </van-tab>

      <van-tab title="DeepSeek 充值">
        <div style="padding:16px;">
          <!-- 余额卡片 -->
          <div style="background:linear-gradient(135deg,#667eea,#764ba2);border-radius:16px;padding:24px;color:#fff;text-align:center;margin-bottom:16px;">
            <div style="font-size:14px;opacity:0.85;margin-bottom:8px;">DeepSeek 账户余额</div>
            <div style="font-size:36px;font-weight:700;">¥{{ dsBalance?.cny_balance?.toFixed(2) || '--' }}</div>
            <div v-if="dsBalance?.cny_granted > 0" style="font-size:12px;opacity:0.7;margin-top:4px;">
              含赠送 ¥{{ dsBalance.cny_granted?.toFixed(2) }}
            </div>
          </div>

          <!-- 支付方式选择 -->
          <van-cell title="支付方式" style="font-weight:600;border-radius:12px 12px 0 0;" />
          <van-radio-group v-model="dsPayMethod" style="background:#fff;border-radius:0 0 12px 12px;margin-bottom:12px;">
            <van-cell-group :border="false">
              <van-cell clickable @click="dsPayMethod = 'WECHAT'">
                <template #title><van-icon name="wechat" color="#07c160" style="margin-right:8px;" />微信支付</template>
                <template #value><van-radio name="WECHAT" /></template>
              </van-cell>
              <van-cell clickable @click="dsPayMethod = 'ALIPAY'">
                <template #title><van-icon name="alipay" color="#1677ff" style="margin-right:8px;" />支付宝</template>
                <template #value><van-radio name="ALIPAY" /></template>
              </van-cell>
            </van-cell-group>
          </van-radio-group>

          <!-- 充值金额选择 -->
          <van-cell title="选择充值金额" style="font-weight:600;border-radius:12px 12px 0 0;" />
          <van-radio-group v-model="dsAmount" style="background:#fff;border-radius:0 0 12px 12px;margin-bottom:12px;">
            <van-cell-group :border="false">
              <van-cell v-for="amt in [10, 20, 50, 100, 200]" :key="amt" clickable @click="dsAmount = amt">
                <template #title><span style="font-weight:500;">¥{{ amt }}</span></template>
                <template #value><van-radio :name="amt" /></template>
              </van-cell>
            </van-cell-group>
          </van-radio-group>

          <van-button type="primary" block round size="large" :disabled="!dsAmount" :loading="dsSubmitting" @click="onDsRecharge">
            充 值 ¥{{ dsAmount }}
          </van-button>
        </div>
      </van-tab>
    </van-tabs>

    <!-- Token 支付弹窗（模拟） -->
    <van-overlay :show="showPayment" @click="showPayment = false">
      <div style="position:absolute;bottom:0;left:0;right:0;background:#fff;border-radius:16px 16px 0 0;max-height:70vh;overflow-y:auto;">
        <div style="padding:20px;text-align:center;">
          <van-icon name="success" color="#07c160" size="48" />
          <h3 style="margin:12px 0;">支付模拟</h3>
          <p style="color:#999;">在微信内置浏览器中，这里会调起微信支付弹窗</p>
          <van-button type="success" block round style="margin-top:16px;" @click="mockPaySuccess">
            模拟支付成功
          </van-button>
          <van-button plain block round style="margin-top:8px;" @click="showPayment = false">取消</van-button>
        </div>
      </div>
    </van-overlay>

    <!-- DeepSeek 扫码支付弹窗 -->
    <van-overlay :show="showDSQR" @click="showDSQR = false">
      <div style="display:flex;align-items:center;justify-content:center;height:100%;padding:32px;">
        <div style="background:#fff;border-radius:16px;padding:24px;text-align:center;max-width:320px;width:100%;">
          <h3 style="margin:0 0 8px;">DeepSeek 扫码支付</h3>
          <p style="color:#999;font-size:13px;margin-bottom:16px;">
            请使用微信/支付宝扫描下方二维码<br/>
            充值金额：<strong>¥{{ dsAmount }}</strong>
          </p>
          <div v-if="dsQRCode" style="background:#f5f5f5;border-radius:12px;padding:16px;margin-bottom:16px;">
            <img :src="dsQRCode" style="width:200px;height:200px;display:block;margin:0 auto;" />
          </div>
          <div v-else style="padding:40px;color:#999;"><van-loading /> 正在生成支付二维码...</div>
          <p v-if="dsPaymentId" style="font-size:11px;color:#ccc;">{{ dsPaymentId }}</p>
          <van-button v-if="dsQRCode" plain block round @click="onDSPoll" :loading="dsPolling">我已付款，确认</van-button>
          <van-button v-if="dsCaptureResult" type="success" block round style="margin-top:8px;">
            ✅ 充值成功！¥{{ dsAmount }}
          </van-button>
          <van-button plain block round style="margin-top:8px;" @click="showDSQR = false">关闭</van-button>
        </div>
      </div>
    </van-overlay>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { showToast, showLoadingToast, closeToast } from 'vant'
import api, { logAction } from '../utils/api.js'

const tabActive = ref(0)
const packages = ref([])
const selectedPkg = ref(null)
const payMethod = ref('wechat')
const balance = ref(0)
const submitting = ref(false)
const showPayment = ref(false)
const currentOrder = ref(null)

// DeepSeek 充值
const dsBalance = ref(null)
const dsAmount = ref(10)
const dsPayMethod = ref('WECHAT')
const dsSubmitting = ref(false)
const showDSQR = ref(false)
const dsQRCode = ref('')
const dsPaymentId = ref('')
const dsPolling = ref(false)
const dsCaptureResult = ref(false)

function formatNumber(n) {
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿'
  if (n >= 10000) return (n / 10000).toFixed(1) + '万'
  return n.toLocaleString()
}

function getSelectedPrice() {
  const pkg = packages.value.find(p => p.id === selectedPkg.value)
  return pkg ? (pkg.price_cent / 100).toFixed(2) : '0.00'
}

// ─── Token 充值 ───

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

// ─── DeepSeek 充值 ───

async function onDsRecharge() {
  if (!dsAmount.value) return
  dsSubmitting.value = true
  dsQRCode.value = ''
  dsPaymentId.value = ''
  dsCaptureResult.value = false
  try {
    const res = await api.post('/mobile/deepseek/payment/create', {
      amount: dsAmount.value,
      method: dsPayMethod.value,
    })
    dsPaymentId.value = res.data?.payment_order_id
    // 优先用后端生成的二维码 base64
    dsQRCode.value = res.data?.qrcode_base64 || res.data?.url || ''
    logAction('ds_payment_create', '/recharge',
      `创建DeepSeek充值: ${dsPayMethod.value}¥${dsAmount.value} | ${dsPaymentId.value}`)
    showDSQR.value = true
  } catch (e) {
    logAction('ds_payment_error', '/recharge', `创建DeepSeek充值失败: ${e}`)
    showToast(e.response?.data?.detail || e.message || '创建充值失败')
  } finally {
    dsSubmitting.value = false
  }
}

async function onDSPoll() {
  if (!dsPaymentId.value) return
  dsPolling.value = true
  try {
    const res = await api.post('/mobile/deepseek/payment/capture', { payment_id: dsPaymentId.value })
    dsCaptureResult.value = true
    logAction('ds_payment_capture', '/recharge', `DeepSeek充值到账: ¥${dsAmount.value} | ${dsPaymentId.value}`)
    // 刷新 DeepSeek 余额
    const bal = await api.get('/mobile/deepseek/balance')
    dsBalance.value = bal
  } catch (e) {
    logAction('ds_payment_poll', '/recharge', `确认支付失败: ${e}`)
    showToast(e.response?.data?.detail || '支付尚未到账，请稍后再试')
  } finally {
    dsPolling.value = false
  }
}

function onTabChange() {
  if (tabActive.value === 1 && !dsBalance.value) {
    api.get('/mobile/deepseek/balance').then(r => dsBalance.value = r).catch(() => {})
  }
}

onMounted(async () => {
  try {
    const [pkgData, profile, dsBal] = await Promise.all([
      api.get('/packages'),
      api.get('/user/profile'),
      api.get('/mobile/deepseek/balance'),
    ])
    packages.value = pkgData
    balance.value = profile.token_balance
    dsBalance.value = dsBal
    if (pkgData.length) selectedPkg.value = pkgData[0].id
  } catch (e) {
    console.error(e)
  }
})
</script>
