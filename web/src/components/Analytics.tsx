import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { initAnalytics, trackPageView } from '../lib/analytics'

/**
 * 라우터 안에 두어야 한다 — useLocation이 필요하다.
 * 화면을 그리지 않으므로 어디에 두든 레이아웃에 영향이 없다.
 */
export function Analytics() {
  const location = useLocation()

  useEffect(() => {
    initAnalytics()
  }, [])

  useEffect(() => {
    // 첫 진입도 여기서 잡힌다 (config에서 send_page_view를 껐다)
    trackPageView(location.pathname)
  }, [location.pathname])

  return null
}
