import type { Destination } from '../db/schema'
import { haversineM } from './schedule'

/** 항상 시작일 순으로 다룬다. order는 표시용 보조 키다. */
export function sortDestinations(list: Destination[]): Destination[] {
  return [...list].sort(
    (a, b) => a.startDate.localeCompare(b.startDate) || a.order - b.order,
  )
}

/**
 * 해당 날짜에 머무는 도시.
 *
 * 종료일이 없으므로 "시작일이 그 날짜 이하인 마지막 목적지"가 답이다.
 * 첫 목적지 시작일보다 이른 날짜(예: 여행 시작 전날 도착)는 첫 목적지로 본다.
 */
export function destinationForDate(
  list: Destination[],
  date: string,
): Destination | undefined {
  const sorted = sortDestinations(list)
  if (sorted.length === 0) return undefined
  let found = sorted[0]
  for (const d of sorted) {
    if (d.startDate <= date) found = d
    else break
  }
  return found
}

/** 지도 중심·검색 편향의 기본값. 목적지가 없으면 undefined */
export function defaultBias(
  list: Destination[],
): { lat: number; lng: number } | undefined {
  const first = sortDestinations(list)[0]
  return first ? { lat: first.lat, lng: first.lng } : undefined
}

/** 좌표에서 가장 가까운 도시 */
export function nearestDestination(
  list: Destination[],
  point: { lat: number; lng: number },
): Destination | undefined {
  let best: Destination | undefined
  let bestD = Infinity
  for (const d of list) {
    const dist = haversineM(d, point)
    if (dist < bestD) {
      bestD = dist
      best = d
    }
  }
  return best
}

/**
 * 새로 등록하는 장소를 어느 도시에 넣을지 정한다.
 * 도시를 골라둔 상태면 그 도시, "전체" 상태면 좌표상 가장 가까운 도시.
 */
export function destinationForPlace(
  list: Destination[],
  active: Destination | undefined,
  point: { lat: number; lng: number },
): string | undefined {
  if (active) return active.id
  return nearestDestination(list, point)?.id
}

/** "바르셀로나 → 세비야 → 마요르카" */
export function routeSummary(list: Destination[]): string {
  return sortDestinations(list)
    .map((d) => d.name)
    .join(' → ')
}
