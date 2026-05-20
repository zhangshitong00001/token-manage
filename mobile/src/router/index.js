import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  { path: '/', redirect: '/home' },
  {
    path: '/home',
    name: 'Home',
    component: () => import('../views/Home.vue'),
    meta: { title: '首页' },
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue'),
    meta: { title: '登录' },
  },
  {
    path: '/usage',
    name: 'Usage',
    component: () => import('../views/Usage.vue'),
    meta: { title: '消耗明细' },
  },
  {
    path: '/recharge',
    name: 'Recharge',
    component: () => import('../views/Recharge.vue'),
    meta: { title: 'Token充值' },
  },
  {
    path: '/profile',
    name: 'Profile',
    component: () => import('../views/Profile.vue'),
    meta: { title: '个人中心' },
  },
  {
    path: '/bills',
    name: 'Bills',
    component: () => import('../views/Bills.vue'),
    meta: { title: 'DeepSeek 账单' },
  },
  {
    path: '/agent',
    name: 'Agent',
    component: () => import('../views/Agent.vue'),
    meta: { title: 'Agent' },
  },
  {
    path: '/chat',
    name: 'Chat',
    component: () => import('../views/Chat.vue'),
    meta: { title: 'Claude-code' },
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('token')
  if (to.name !== 'Login' && !token) {
    next({ name: 'Login' })
  } else {
    next()
  }
})

export default router
