<template>
  <div class="page">
    <!-- 今日消耗概览 -->
    <div class="card" style="text-align:center;">
      <div style="font-size:14px;color:#999;margin-bottom:8px;">今日已消耗 Token</div>
      <div class="token-number">{{ formatNumber(todayUsage.today_cost || 0) }}</div>
      <div style="display:flex;justify-content:space-around;margin-top:16px;font-size:13px;color:#666;">
        <span>输入: {{ formatNumber(todayUsage.today_input || 0) }}</span>
        <span>输出: {{ formatNumber(todayUsage.today_output || 0) }}</span>
      </div>
    </div>

    <!-- 近7天趋势 -->
    <div class="card">
      <van-cell title="近7天趋势" :value="'总计 ' + formatNumber(total7d) + ' Token'" />
      <van-empty v-if="!trend.length" description="暂无数据" />
      <div
        v-for="(item, i) in trend"
        :key="i"
        style="display:flex;align-items:center;padding:8px 0;border-bottom:1px solid #f5f5f5;"
      >
        <span style="width:80px;font-size:13px;color:#666;">{{ item.date }}</span>
        <div style="flex:1;height:20px;background:#f0f0f0;border-radius:10px;overflow:hidden;margin:0 8px;">
          <div
            :style="{
              width: maxVal > 0 ? (item.total_cost / maxVal * 100) + '%' : '0%',
              height: '100%',
              background: 'linear-gradient(90deg, #1989fa, #07c160)',
              borderRadius: '10px',
              transition: 'width 0.3s',
            }"
          ></div>
        </div>
        <span style="width:70px;text-align:right;font-size:12px;color:#999;">
          {{ formatNumber(item.total_cost) }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import api from '../utils/api.js'

const todayUsage = ref({})
const trend = ref([])

const maxVal = computed(() => Math.max(...trend.value.map(t => t.total_cost), 1))
const total7d = computed(() => trend.value.reduce((s, t) => s + t.total_cost, 0))

function formatNumber(n) {
  if (n >= 10000) return (n / 10000).toFixed(1) + '万'
  return n.toLocaleString()
}

onMounted(async () => {
  try {
    const [usage, trendData] = await Promise.all([
      api.get('/mobile/usage/today'),
      api.get('/mobile/usage/trend?days=7'),
    ])
    todayUsage.value = usage
    trend.value = trendData.trend
  } catch (e) {
    console.error(e)
  }
})
</script>
