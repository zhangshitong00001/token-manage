<template>
  <div class="page">
    <!-- 近7天消耗概览 -->
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid #f5f5f5;">
        <span style="font-weight:600;font-size:15px;">📊 近{{ days }}天消耗</span>
        <span style="font-size:13px;color:#999;">
          Total: {{ formatNumber(summary.total_tokens || 0) }} Token
        </span>
      </div>

      <!-- 汇总卡片 -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;padding:12px 16px;">
        <div style="text-align:center;background:#f0f5ff;border-radius:8px;padding:10px;">
          <div style="font-size:11px;color:#999;">输入Token</div>
          <div style="font-size:16px;font-weight:700;color:#1890ff;margin-top:4px;">
            {{ formatNumber(summary.total_input_tokens || 0) }}
          </div>
        </div>
        <div style="text-align:center;background:#f6ffed;border-radius:8px;padding:10px;">
          <div style="font-size:11px;color:#999;">输出Token</div>
          <div style="font-size:16px;font-weight:700;color:#52c41a;margin-top:4px;">
            {{ formatNumber(summary.total_output_tokens || 0) }}
          </div>
        </div>
        <div style="text-align:center;background:#fff7e6;border-radius:8px;padding:10px;">
          <div style="font-size:11px;color:#999;">费用(USD)</div>
          <div style="font-size:16px;font-weight:700;color:#fa8c16;margin-top:4px;">
            ${{ (summary.total_cost_usd || 0).toFixed(4) }}
          </div>
        </div>
      </div>
    </div>

    <!-- 每日消耗明细 -->
    <div class="card">
      <div style="padding:12px 16px;border-bottom:1px solid #f5f5f5;">
        <span style="font-weight:600;font-size:15px;">📈 每日消耗明细</span>
      </div>
      <div v-if="items.length === 0" style="padding:40px 0;text-align:center;color:#999;">
        暂无消耗数据
      </div>
      <div v-for="(item, i) in items" :key="i"
        style="display:flex;align-items:center;padding:10px 16px;border-bottom:1px solid #f5f5f5;">
        <div style="width:80px;font-weight:600;font-size:14px;">{{ item.stats_date.slice(5) }}</div>
        <div style="flex:1;">
          <div style="display:flex;align-items:center;gap:4px;margin-bottom:2px;">
            <div style="height:8px;flex:1;background:#f0f0f0;border-radius:4px;overflow:hidden;">
              <div :style="{
                width: maxTokens > 0 ? (item.total_tokens / maxTokens * 100) + '%' : '0%',
                height: '100%',
                background: 'linear-gradient(90deg, #1890ff, #52c41a)',
                borderRadius: '4px',
                transition: 'width 0.3s',
              }"></div>
            </div>
            <span style="font-size:12px;color:#666;width:65px;text-align:right;">
              {{ formatNumber(item.total_tokens) }}
            </span>
          </div>
          <div style="display:flex;gap:12px;font-size:11px;color:#999;">
            <span>Input {{ formatNumber(item.total_input_tokens) }}</span>
            <span>Output {{ formatNumber(item.total_output_tokens) }}</span>
            <span>${{ item.estimated_cost_usd.toFixed(4) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import api from '../utils/api.js'

const days = ref(7)
const items = ref([])
const summary = ref({})

const maxTokens = computed(() => Math.max(...items.value.map(t => t.total_tokens), 1))

function formatNumber(n) {
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿'
  if (n >= 10000) return (n / 10000).toFixed(1) + '万'
  return n.toLocaleString()
}

onMounted(async () => {
  try {
    const [dailyRes, summaryRes] = await Promise.all([
      api.get(`/mobile/system/usage/daily?days=${days.value}`),
      api.get(`/mobile/system/usage/summary?days=${days.value}`),
    ])
    items.value = dailyRes.items || []
    summary.value = summaryRes
  } catch (e) {
    console.error(e)
  }
})
</script>
