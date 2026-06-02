<template>
  <div id="app">
    <!-- 顶部导航栏（登录页不显示，登录页有自己的头部） -->
    <van-nav-bar
      v-if="route.name !== 'Login'"
      :title="route.meta.title"
      :left-arrow="route.name !== 'Home'"
      @click-left="router.back()"
      fixed
      placeholder
    />

    <!-- 页面内容 -->
    <router-view />

    <!-- 底部导航栏 -->
    <van-tabbar
      v-if="route.name !== 'Login'"
      v-model="active"
      @change="onTabChange"
      fixed
      route
      placeholder
    >
      <van-tabbar-item name="home" icon="home-o" to="/home">首页</van-tabbar-item>
      <van-tabbar-item name="agent" icon="chat-o" to="/agent">Agent</van-tabbar-item>
      <van-tabbar-item name="usage" icon="chart-trending-o" to="/usage">消耗</van-tabbar-item>
      <van-tabbar-item name="recharge" icon="gold-coin-o" to="/recharge">充值</van-tabbar-item>
      <van-tabbar-item name="profile" icon="contact-o" to="/profile">我的</van-tabbar-item>
    </van-tabbar>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const active = ref('home')

// 根据路由更新 tabbar 高亮
watch(
  () => route.name,
  (name) => {
    const map = { Home: 'home', Agent: 'agent', Chat: 'chat', Usage: 'usage', Recharge: 'recharge', Profile: 'profile' }
    if (map[name]) active.value = map[name]
  },
  { immediate: true }
)
</script>
