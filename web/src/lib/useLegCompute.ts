import { useEffect, useRef, useState } from 'react'
import { useMapsLibrary } from '@vis.gl/react-google-maps'
import type { Item, Leg, Place } from '../db/schema'
import { markLegComputed, saveLegOption } from '../db/plannerRepo'
import { fetchRoute } from './directions'
import { guessMode, haversineM } from './schedule'

/** computedAt이 이만큼 지나면 다시 계산한다 (DESIGN.md §4) */
const STALE_MS = 7 * 24 * 60 * 60 * 1000

interface Args {
  legs: Leg[]
  items: Item[]
  places: Place[]
  /** 대중교통 출발 시각 계산용 — 없으면 지금 시각 */
  departAtByLegId?: Map<string, Date>
}

/**
 * 아직 계산되지 않은 Leg를 하나씩 채운다.
 *
 * 비용 방어: 자동 계산은 **주 수단 1개만** 부른다(직선거리로 추정).
 * 대안 수단은 사용자가 비교를 눌렀을 때만 추가로 부른다.
 * 한 번에 하나씩 순차 처리해서 항목을 여러 개 넣어도 호출이 폭주하지 않게 한다.
 */
export function useLegCompute({ legs, items, places, departAtByLegId }: Args) {
  const routesLib = useMapsLibrary('routes')
  const [computing, setComputing] = useState<string | null>(null)
  const [failed, setFailed] = useState<Record<string, true>>({})
  const inFlight = useRef(false)

  useEffect(() => {
    if (!routesLib || inFlight.current) return

    const itemById = new Map(items.map((i) => [i.id, i]))
    const placeById = new Map(places.map((p) => [p.id, p]))

    const target = legs.find((l) => {
      if (failed[l.id]) return false
      if (l.alternatives.length === 0) return true
      if (l.staleReason) return true
      return Date.now() - l.computedAt > STALE_MS
    })
    if (!target) return

    const from = placeById.get(itemById.get(target.fromItemId)?.placeId ?? '')
    const to = placeById.get(itemById.get(target.toItemId)?.placeId ?? '')
    if (!from || !to) return

    let cancelled = false
    inFlight.current = true
    setComputing(target.id)

    void (async () => {
      const service = new routesLib.DirectionsService()
      const straight = haversineM(from, to)
      const mode = target.alternatives.length
        ? target.selectedMode
        : guessMode(straight)

      try {
        const option = await fetchRoute(service, {
          from: { lat: from.lat, lng: from.lng },
          to: { lat: to.lat, lng: to.lng },
          mode,
          departAt: departAtByLegId?.get(target.id),
        })
        // cancelled여도 저장은 한다. 이미 API를 부른 결과를 버리면 호출이 낭비되고,
        // 저장으로 발생하는 liveQuery 갱신이 없어져 다음 Leg 계산이 멈춰버린다.
        if (option) {
          await saveLegOption(target.id, option, true)
        } else {
          // 경로가 없는 구간(도서 지역 도보 등)은 다시 두드려도 소용없다
          await markLegComputed(target.id)
          if (!cancelled) setFailed((f) => ({ ...f, [target.id]: true }))
        }
      } catch (err) {
        console.error('경로 계산 실패', err)
        if (!cancelled) setFailed((f) => ({ ...f, [target.id]: true }))
      } finally {
        if (!cancelled) setComputing(null)
        inFlight.current = false
      }
    })()

    return () => {
      cancelled = true
    }
  }, [routesLib, legs, items, places, departAtByLegId, failed])

  return {
    ready: Boolean(routesLib),
    computing,
    failedLegIds: failed,
    retry: (legId: string) =>
      setFailed((f) => {
        const next = { ...f }
        delete next[legId]
        return next
      }),
  }
}
