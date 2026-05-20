<template>
  <div class="agent-page">
    <!-- Claude-code 入口卡片 -->
    <div class="agent-card" @click="openClaudeCode">
      <div class="agent-card-icon">
        <van-icon name="chat" size="28" color="#1989fa" />
      </div>
      <div class="agent-card-body">
        <div class="agent-card-title">Claude-code</div>
        <div class="agent-card-desc">基于 Claude Code Agent 的 AI 编程助手，可执行命令、分析代码、查询数据</div>
      </div>
      <van-icon name="arrow" color="#ccc" />
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'

const router = useRouter()

function openClaudeCode() {
  router.push('/chat')
}
</script>

<style scoped>
.agent-page {
  padding: 16px;
}
.agent-card {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  cursor: pointer;
  transition: all 0.2s;
}
.agent-card:active {
  transform: scale(0.98);
  opacity: 0.8;
}
.agent-card-icon {
  width: 48px;
  height: 48px;
  background: #e8f4ff;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.agent-card-body {
  flex: 1;
  min-width: 0;
}
.agent-card-title {
  font-size: 15px;
  font-weight: 600;
  color: #333;
}
.agent-card-desc {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
  line-height: 1.4;
}
</style>
