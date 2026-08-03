import { useEffect, useState } from 'react'

/**
 * 오프라인이면 화면 상단에 붙여 읽기 전용임을 알린다.
 * 이 배너 없이 수정하려다 실패하면 사용자는 앱이 고장난 줄 안다.
 */
export function OfflineBanner() {
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )

  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  if (online) return null

  return (
    <div className="sticky top-0 z-30 bg-slate-800 px-4 py-2 text-center text-xs text-white">
      📴 오프라인 — 저장된 일정을 보고 있습니다. 수정은 연결된 뒤에 가능합니다.
    </div>
  )
}
