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

          <!-- 充值金额 -->
          <div style="background:#fff;border-radius:12px;padding:16px;margin-bottom:12px;">
            <div style="font-weight:600;margin-bottom:12px;">充值金额</div>
            <div style="display:flex;align-items:center;background:#f5f5f5;border-radius:8px;padding:8px 12px;">
              <span style="font-size:20px;font-weight:700;color:#667eea;">¥</span>
              <input
                v-model="dsAmount"
                type="number"
                min="1"
                step="1"
                placeholder="输入充值金额"
                style="flex:1;border:none;background:transparent;font-size:24px;font-weight:700;outline:none;padding:4px 8px;"
              />
            </div>
            <div style="display:flex;gap:8px;margin-top:8px;">
              <div
                v-for="amt in quickAmounts" :key="amt"
                :style="{
                  flex:1, padding:'8px 0', textAlign:'center', borderRadius:8, fontSize:14, fontWeight:600, cursor:'pointer',
                  border: dsAmount == amt ? '2px solid #667eea' : '2px solid #eee',
                  color: dsAmount == amt ? '#667eea' : '#666',
                  background: dsAmount == amt ? '#f0eeff' : '#fafafa',
                }"
                @click="dsAmount = amt"
              >¥{{ amt }}</div>
            </div>
          </div>

          <!-- 支付方式 -->
          <div style="background:#fff;border-radius:12px;padding:16px;margin-bottom:12px;">
            <div style="font-weight:600;margin-bottom:12px;">支付方式</div>
            <div
              :style="{
                display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px',
                borderRadius:8, cursor:'pointer', marginBottom:8,
                border: dsPayMethod === 'WECHAT' ? '2px solid #07c160' : '2px solid #eee',
                background: dsPayMethod === 'WECHAT' ? '#f0fff4' : '#fafafa',
              }"
              @click="dsPayMethod = 'WECHAT'"
            >
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:24px;">💚</span>
                <span style="font-weight:500;">微信支付</span>
              </div>
              <div :style="{width:18,height:18,borderRadius:'50%',border:'2px solid',borderColor:dsPayMethod==='WECHAT'?'#07c160':'#ddd',display:'flex',alignItems:'center',justifyContent:'center'}">
                <div v-if="dsPayMethod === 'WECHAT'" style="width:10px;height:10px;borderRadius:'50%';background:'#07c160'"></div>
              </div>
            </div>
            <div
              :style="{
                display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px',
                borderRadius:8, cursor:'pointer',
                border: dsPayMethod === 'ALIPAY' ? '2px solid #1989fa' : '2px solid #eee',
                background: dsPayMethod === 'ALIPAY' ? '#f0f8ff' : '#fafafa',
              }"
              @click="dsPayMethod = 'ALIPAY'"
            >
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:24px;">🔵</span>
                <span style="font-weight:500;">支付宝</span>
              </div>
              <div :style="{width:18,height:18,borderRadius:'50%',border:'2px solid',borderColor:dsPayMethod==='ALIPAY'?'#1989fa':'#ddd',display:'flex',alignItems:'center',justifyContent:'center'}">
                <div v-if="dsPayMethod === 'ALIPAY'" style="width:10px;height:10px;borderRadius:'50%';background:'#1989fa'"></div>
              </div>
            </div>
          </div>

          <!-- 立即充值按钮 -->
          <van-button
            type="primary" block round size="large"
            :loading="dsSubmitting"
            :disabled="!dsAmount || dsAmount < 1"
            @click="onDsRecharge"
            style="background:linear-gradient(135deg,#667eea,#764ba2);border:none;"
          >
            {{ dsSubmitting ? '创建中...' : `扫码支付 ¥${dsAmount || '--'}` }}
          </van-button>

          <!-- 同步按钮 -->
          <van-button
            block round size="small"
            :loading="syncing"
            @click="onSyncInvoices"
            style="margin-top:12px;border:1px solid #667eea;color:#667eea;background:transparent;"
          >
            {{ syncing ? '同步中...' : '🔄 同步账单并刷新余额' }}
          </van-button>
          <div v-if="syncMsg" style="text-align:center;font-size:12px;color:#999;margin-top:6px;">{{ syncMsg }}</div>

          <div style="text-align:center;margin-top:12px;">
            <router-link to="/bills" style="color:#667eea;font-size:13px;text-decoration:none;">📋 查看充值账单</router-link>
          </div>
        </div>

        <!-- 二维码弹窗 -->
        <van-overlay :show="showQrModal" @click="showQrModal = false">
          <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;border-radius:16px;padding:24px;width:300px;text-align:center;">
            <div style="font-size:16px;font-weight:600;margin-bottom:8px;">
              {{ dsPayMethod === 'WECHAT' ? '💚 微信扫码支付' : '🔵 支付宝扫码支付' }}
            </div>
            <div style="color:#999;font-size:13px;margin-bottom:16px;">¥{{ dsAmount }}</div>
            <img v-if="qrImage" :src="qrImage" style="width:240px;height:240px;border-radius:8px;" />
            <van-loading v-else size="40" />
            <div style="color:#999;font-size:12px;margin-top:12px;line-height:1.6;">
              请使用{{ dsPayMethod === 'WECHAT' ? '微信' : '支付宝' }}扫码完成支付<br/>
              <span style="color:#667eea;">支付成功后点击下方按钮确认</span>
            </div>
            <div style="display:flex;gap:8px;margin-top:16px;">
              <van-button
                type="default" block round size="small"
                :loading="statusLoading"
                @click="onCheckStatus"
              >
                我已支付
              </van-button>
              <van-button
                type="primary" block round size="small"
                style="background:linear-gradient(135deg,#667eea,#764ba2);border:none;"
                @click="showQrModal = false"
              >
                关闭
              </van-button>
            </div>
            <div v-if="statusMsg" style="margin-top:8px;font-size:12px;color:#52c41a;">{{ statusMsg }}</div>
          </div>
        </van-overlay>
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

// DeepSeek 充值相关
const dsBalance = ref(null)
const dsAmount = ref(1)
const dsPayMethod = ref('WECHAT')
const dsSubmitting = ref(false)
const quickAmounts = [1, 10, 30, 50, 100]
const syncing = ref(false)
const syncMsg = ref('')
const showQrModal = ref(false)
const qrImage = ref('')
const currentPaymentId = ref('')
const statusLoading = ref(false)
const statusMsg = ref('')

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

// ─── DeepSeek 扫码充值 ───

/** 创建支付，显示二维码 */
async function onDsRecharge() {
  if (!dsAmount.value || dsAmount.value < 1) {
    showToast('请输入有效金额')
    return
  }
  dsSubmitting.value = true
  showQrModal.value = true
  qrImage.value = ''
  statusMsg.value = ''
  try {
    const res = await api.post('/mobile/deepseek/payment/create', {
      amount: dsAmount.value,
      method: dsPayMethod.value,
    })
    if (res?.success && res?.data?.qrcode_base64) {
      qrImage.value = res.data.qrcode_base64
      currentPaymentId.value = res.data.payment_order_id
      showToast('二维码生成成功')
    } else {
      showToast('创建支付失败')
      showQrModal.value = false
    }
  } catch (e) {
    showQrModal.value = false
    qrImage.value = ''
    showToast(e.response?.data?.detail || '创建支付失败')
  } finally {
    dsSubmitting.value = false
  }
}

/** 我已支付 — 确认支付状态 */
async function onCheckStatus() {
  if (!currentPaymentId.value) return
  statusLoading.value = true
  statusMsg.value = ''
  try {
    // 先 capture 确认
    await api.post('/mobile/deepseek/payment/capture', {
      payment_id: currentPaymentId.value,
    }).catch(() => {})
    // 再查状态
    const statusRes = await api.get('/mobile/deepseek/payment/status', {
      params: { payment_id: currentPaymentId.value },
    })
    if (statusRes?.success) {
      const st = statusRes.data?.status || ''
      if (st === 'PAID') {
        statusMsg.value = '✅ 支付成功！正在同步账单...'
        showToast('支付成功')
        await onSyncInvoices()
        setTimeout(() => { showQrModal.value = false }, 1500)
      } else if (st === 'CREATED' || st === 'PROCESSING') {
        statusMsg.value = '⏳ 支付处理中，请稍后再查'
      } else {
        statusMsg.value = `状态: ${st}，请稍后再试`
      }
    }
  } catch (e) {
    statusMsg.value = '查询失败，请确认是否已支付'
  } finally {
    statusLoading.value = false
  }
}

/** 同步 DeepSeek 账单并刷新余额 */
async function onSyncInvoices() {
  syncing.value = true
  syncMsg.value = ''
  try {
    const res = await api.post('/mobile/deepseek/invoices/sync')
    syncMsg.value = res.message || '同步完成'
    try {
      const bal = await api.get('/mobile/deepseek/balance')
      dsBalance.value = bal
    } catch (_) {}
    showToast('账单已同步')
  } catch (e) {
    syncMsg.value = '同步失败: ' + (e.response?.data?.detail || e.message)
  } finally {
    syncing.value = false
  }
}

/** Tab 切换时刷新余额 */
function onTabChange() {
  if (tabActive.value === 1) {
    if (!dsBalance.value) {
      api.get('/mobile/deepseek/balance').then(r => dsBalance.value = r).catch(() => {})
    }
  }
}

// ─── 生命周期 ───

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
