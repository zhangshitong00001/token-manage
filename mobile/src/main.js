import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './styles/main.css'
import api from './utils/api'

const app = createApp(App)
app.use(router)
app.mount('#app')

// ====== 全局前端埋点 ======

/** 上报用户操作日志 */
function logAction(action, page, detail) {
  const token = localStorage.getItem('token')
  if (!token) return // 未登录不上报
  api.post('/log/action', { action, page, detail }).catch(() => {
    // 静默失败，不影响用户体验
  })
}

// 监听路由切换 → 记录页面浏览
router.afterEach((to) => {
  logAction('page_view', to.path, `浏览了页面: ${to.meta?.title || to.path}`)
})

// 全局错误捕获 → 记录前端错误
window.onerror = (msg, source, line, col, error) => {
  logAction('frontend_error', window.location.hash, 
    `错误: ${msg} | 文件: ${source}:${line}:${col}`)
}

// 挂载全局日志方法
app.config.globalProperties.$logAction = logAction

console.log('📋 前端埋点已加载')
