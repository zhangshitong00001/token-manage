import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
})

// 响应拦截器 - 自动处理 401
api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    if (err.response?.status === 401) {
      window.location.hash = '#/login'
    }
    return Promise.reject(err)
  }
)

/** 前端操作日志上报 */
export function logAction(action, page, detail) {
  const token = localStorage.getItem('token')
  if (!token) return
  api.post('/log/action', { action, page, detail }).catch(() => {})
}

export default api
