/**
 * Google Analytics 4.
 *
 * 스니펫을 index.html에 그대로 박지 않고 여기서 주입한다. 이유 둘:
 *  · localhost 개발 트래픽이 실제 데이터에 섞이는 걸 막아야 한다
 *  · 측정 ID를 환경변수로 바꿀 수 있어야 한다
 *
 * SPA라 자동 page_view는 첫 로딩 1회만 발생한다. 그래서 send_page_view를 끄고
 * 라우터 변경마다 직접 보낸다 (useAnalytics).
 */

/** 측정 ID는 비밀이 아니다. 환경변수를 안 넣어도 동작하도록 기본값을 둔다. */
const GA_ID = (import.meta.env?.VITE_GA_ID ?? 'G-ZG57N6TY7R').trim()

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

let started = false

function shouldTrack(): boolean {
  if (!GA_ID) return false
  if (typeof window === 'undefined') return false
  const h = window.location.hostname
  // 개발 중 클릭이 실제 지표를 흐리면 판단을 그르친다
  if (h === 'localhost' || h === '127.0.0.1' || h.endsWith('.local')) return false
  return true
}

export function initAnalytics(): void {
  if (started || !shouldTrack()) return
  started = true

  window.dataLayer = window.dataLayer || []
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer!.push(args)
  }
  window.gtag('js', new Date())
  window.gtag('config', GA_ID, {
    // 라우터 변경마다 직접 보낸다. 켜두면 첫 화면이 두 번 집계된다.
    send_page_view: false,
  })

  const s = document.createElement('script')
  s.async = true
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`
  document.head.appendChild(s)
}

/**
 * 경로에서 식별자를 지운다.
 *
 * `/trip/9f8e.../plan` 을 그대로 보내면 리포트가 여행 개수만큼 쪼개져 아무것도
 * 읽히지 않는다. 그리고 여행 id를 분석 도구에 넘길 이유도 없다.
 */
export function normalizePath(pathname: string): string {
  return pathname.replace(
    /\/trip\/[^/]+/,
    '/trip/:tripId',
  )
}

export function trackPageView(pathname: string, title?: string): void {
  if (!started || !window.gtag) return
  window.gtag('event', 'page_view', {
    page_path: normalizePath(pathname),
    page_title: title ?? document.title,
    page_location: window.location.origin + normalizePath(pathname),
  })
}

export function trackEvent(
  name: string,
  params?: Record<string, string | number | boolean>,
): void {
  if (!started || !window.gtag) return
  window.gtag('event', name, params)
}
