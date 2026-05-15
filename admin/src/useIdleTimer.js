import { useEffect, useRef, useCallback } from 'react'

/** 空闲检测 Hook：监听用户操作，10分钟无操作触发回调 */
const IDLE_TIMEOUT_MS = 10 * 60 * 1000  // 10分钟
const CHECK_INTERVAL_MS = 30 * 1000      // 每30秒检查一次

export default function useIdleTimer(onIdle, enabled = true) {
  const lastActivityRef = useRef(Date.now())
  const checkRef = useRef(null)

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now()
  }, [])

  useEffect(() => {
    if (!enabled) return

    // 监听用户活动事件
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll', 'click']
    const handler = () => {
      lastActivityRef.current = Date.now()
    }
    events.forEach(evt => window.addEventListener(evt, handler))

    // 每秒检查一次空闲时间
    checkRef.current = setInterval(() => {
      const idle = Date.now() - lastActivityRef.current
      if (idle >= IDLE_TIMEOUT_MS) {
        onIdle()
      }
    }, CHECK_INTERVAL_MS)

    return () => {
      events.forEach(evt => window.removeEventListener(evt, handler))
      if (checkRef.current) clearInterval(checkRef.current)
    }
  }, [enabled, onIdle])

  return resetTimer
}
