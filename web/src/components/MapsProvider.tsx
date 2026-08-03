import type { ReactNode } from 'react'
import { APIProvider } from '@vis.gl/react-google-maps'
import { GOOGLE_MAPS_API_KEY, hasMapsKey } from '../lib/env'

/**
 * Maps JS API를 앱 전체에 한 번만 로드한다.
 * Places 자동완성과 지도가 같은 로더를 공유해야 스크립트가 두 번 안 붙는다.
 *
 * 키가 없으면 APIProvider를 아예 걸지 않는다 — 빈 키로 붙이면
 * 콘솔이 인증 실패 에러로 도배된다.
 */
export function MapsProvider({ children }: { children: ReactNode }) {
  if (!hasMapsKey) return <>{children}</>

  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY} language="ko" region="KR">
      {children}
    </APIProvider>
  )
}
