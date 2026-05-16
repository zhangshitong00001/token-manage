<template>
  <div class="page">
    <!-- Token 余额卡片 -->
    <div class="balance-card">
      <div class="label">当前 Token 余额</div>
      <div class="amount">{{ formatNumber(userInfo.token_balance || 0) }}</div>
      <div class="sub">今日已消耗: {{ formatNumber(todayUsage.today_cost || 0) }} Token</div>
    </div>

    <!-- DeepSeek 账户余额 -->
    <div class="card" style="margin-top:12px;" v-if="dsBalance.available !== null">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;">
        <div>
          <div style="font-size:13px;color:#999;">🔋 DeepSeek 账户余额</div>
          <div style="font-size:20px;font-weight:700;color:#1677ff;margin-top:4px;">
            ¥{{ dsBalance.cny_balance?.toFixed(2) || '--' }}
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:11px;color:#999;">赠送金</div>
          <div style="font-size:14px;font-weight:600;color:#52c41a;">
            ¥{{ dsBalance.cny_granted?.toFixed(2) || '0.00' }}
          </div>
        </div>
      </div>
      <div style="padding:0 16px 12px;font-size:11px;color:#bbb;">
        数据来源: DeepSeek 官方 · 实时
      </div>
    </div>

    <!-- 快捷操作 -->
    <van-grid :column-num="3" :border="false" class="card" style="margin-top:12px;">
      <van-grid-item icon="gold-coin-o" text="Token充值" to="/recharge" />
      <van-grid-item icon="chart-trending-o" text="消耗明细" to="/usage" />
      <van-grid-item icon="records-o" text="充值记录" @click="showOrdersSheet" />
    </van-grid>

    <!-- 近7天趋势 -->
    <div class="card" style="margin-top:12px;">
      <div class="van-cell__title" style="margin-bottom:12px;font-weight:600">近7天消耗趋势</div>
      <div v-if="trend.length" style="display:flex;align-items:flex-end;height:120px;gap:4px;">
        <div
          v-for="(item, i) in trend"
          :key="i"
          style="flex:1;display:flex;flex-direction:column;align-items:center;"
        >
          <div
            :style="{
              height: trendMax > 0 ? (item.total_cost / trendMax * 100) + 'px' : '0px',
              width: '100%',
              background: 'linear-gradient(180deg, #1989fa, #07c160)',
              borderRadius: '4px 4px 0 0',
              transition: 'height 0.3s',
              minHeight: '4px',
            }"
          ></div>
          <span style="font-size:10px;color:#999;margin-top:4px;">
            {{ item.date.slice(5) }}
          </span>
        </div>
      </div>
      <van-empty v-else description="暂无消耗数据" />
    </div>

    <!-- 充值记录弹窗 -->
    <van-action-sheet v-model:show="showOrders" title="充值记录" closeable>
      <div style="padding:16px;">
        <van-empty v-if="orders.length === 0" description="暂无充值记录" />
        <van-cell
          v-for="(o, i) in orders"
          :key="i"
          :title="'订单: ' + o.order_no.slice(-12)"
          :label="'状态: ' + (o.pay_status === 1 ? '✅ 已支付' : '⏳ 待支付') + ' | ' + (o.create_time || '').slice(0, 16)"
          :value="'¥' + (o.amount_cent / 100).toFixed(2)"
        />
      </div>
    </van-action-sheet>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { showToast } from 'vant'
import api from '../utils/api.js'

const userInfo = ref({})
const todayUsage = ref({})
const dsBalance = ref({ available: null, cny_balance: 0, cny_granted: 0, cny_topped_up: 0 })
const trend = ref([])
const trendMax = ref(0)
const orders = ref([])
const showOrders = ref(false)

function formatNumber(n) {
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿'
  if (n >= 10000) return (n / 10000).toFixed(1) + '万'
  return n.toLocaleString()
}

async function loadOrders() {
  try {
    const res = await api.get('/order/my-orders')
    orders.value = res
  } catch (e) {
    console.error('加载充值记录失败', e)
  }
}

async function showOrdersSheet() {
  showOrders.value = true
  await loadOrders()
}

async function loadData() {
  try {
    const [profile, sysDaily, sysSummary, balance] = await Promise.all([
      api.get('/user/profile'),
      api.get('/mobile/system/usage/daily?days=7'),
      api.get('/mobile/system/usage/summary?days=7'),
      api.get('/mobile/deepseek/balance'),
    ])
    userInfo.value = profile
    dsBalance.value = balance

    // 今日消耗用最近一天的数据
    const items = sysDaily.items || []
    const todayItem = items.find(i => i.stats_date === new Date().toISOString().slice(0, 10))
    todayUsage.value = {
      today_cost: todayItem?.total_tokens || (items[0]?.total_tokens || 0),
      today_input: todayItem?.total_input_tokens || (items[0]?.total_input_tokens || 0),
      today_output: todayItem?.total_output_tokens || (items[0]?.total_output_tokens || 0),
    }

    // 趋势图
    trend.value = items.reverse().map(t => ({
      date: t.stats_date,
      total_cost: t.total_tokens,
    }))
    trendMax.value = Math.max(...trend.value.map(t => t.total_cost), 1)
  } catch (e) {
    console.error('加载数据失败', e)
  }
}

onMounted(loadData)
</script>
