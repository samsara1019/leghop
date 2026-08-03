import { useCallback, useEffect, useState } from 'react'
import { mirrorTrip } from '../db/sync'
import { hasSupabase } from './env'

/**
 * 여행 화면을 열 때 서버에서 통째로 받아 로컬 미러를 교체한다.
 *
 * 창으로 돌아올 때와 온라인 복귀 시에도 다시 받는다 — 둘이 같이 편집하는데
 * 상대 변경이 다음 새로고침까지 안 보이면 서로 덮어쓴 것처럼 느껴진다.
 * 실시간 구독(Supabase Realtime)까지 가면 더 좋지만, 이 정도로 대부분 덮인다.
 */
export function useTripSync(tripId: string) {
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [syncedAt, setSyncedAt] = useState<number | null>(null)

  const pull = useCallback(async () => {
    if (!tripId || !hasSupabase) return
    setSyncing(true)
    try {
      await mirrorTrip(tripId)
      setError(null)
      setSyncedAt(Date.now())
    } catch (err) {
      // 오프라인이면 실패가 정상 — 기존 미러로 계속 본다
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSyncing(false)
    }
  }, [tripId])

  useEffect(() => {
    void pull()
  }, [pull])

  useEffect(() => {
    const onFocus = () => void pull()
    window.addEventListener('focus', onFocus)
    window.addEventListener('online', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('online', onFocus)
    }
  }, [pull])

  return { syncing, error, syncedAt, refresh: pull }
}
