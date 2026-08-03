import type { Item, Leg, TravelMode } from '../db/schema'

/** 이 거리 이하면 대중교통보다 걷는 게 낫다 (DESIGN.md §3.3) */
const WALKABLE_M = 1200

export function haversineM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const la1 = (a.lat * Math.PI) / 180
  const la2 = (b.lat * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** 직선거리로 주 수단을 추정한다. Directions를 부르기 전이라 실거리는 모른다. */
export function guessMode(straightLineM: number): TravelMode {
  return straightLineM <= WALKABLE_M ? 'walking' : 'transit'
}

export function formatDuration(seconds: number): string {
  const min = Math.round(seconds / 60)
  if (min < 60) return `${min}분`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`
  return `${(meters / 1000).toFixed(1)}km`
}

// ---------- 시각 계산 ----------

/** "09:40" → 580 (자정 기준 분) */
export function parseHHMM(v: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/** 580 → "09:40". 자정을 넘기면 그대로 넘어간 시각을 준다 */
export function formatHHMM(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export interface ScheduledItem {
  item: Item
  /** 자정 기준 분 */
  startMin: number
  endMin: number
  /** 사용자가 직접 고정한 시각인가 (아니면 앞 항목에서 계산된 값) */
  pinned: boolean
  /** 이 항목으로 오는 이동 구간 */
  incomingLeg?: Leg
  /** 다음 날로 넘어갔는가 */
  overnight: boolean
}

const DEFAULT_START_MIN = 9 * 60

/**
 * 타임라인의 각 항목이 몇 시에 시작·끝나는지 계산한다.
 *
 * startAt이 박힌 항목은 그 시각을 기준점으로 삼고, 없는 항목은 앞 항목의 종료 시각 +
 * 이동 시간으로 이어붙인다. 그래서 "공항 도착 09:40"만 넣어도 뒤가 전부 채워진다.
 */
export function buildSchedule(
  items: Item[],
  legs: Leg[],
): { rows: ScheduledItem[]; totalTravelS: number } {
  const legByTo = new Map(legs.map((l) => [l.toItemId, l]))
  const rows: ScheduledItem[] = []
  let cursor: number | null = null
  let totalTravelS = 0

  for (const item of items) {
    const incomingLeg = legByTo.get(item.id)
    const selected = incomingLeg?.alternatives.find(
      (a) => a.mode === incomingLeg.selectedMode,
    )
    const travelS = selected?.durationS ?? 0
    if (travelS) totalTravelS += travelS

    const pinnedMin = item.startAt ? parseHHMM(item.startAt) : null
    let startMin: number
    let pinned = false

    if (pinnedMin !== null) {
      startMin = pinnedMin
      pinned = true
      // 고정 시각이 앞 항목보다 이르면 자정을 넘긴 것으로 본다 (심야 도착 등)
      if (cursor !== null && startMin < cursor) startMin += 1440
    } else if (cursor === null) {
      startMin = DEFAULT_START_MIN
    } else {
      startMin = cursor + Math.round(travelS / 60)
    }

    const endMin = startMin + item.durationMin
    rows.push({
      item,
      startMin,
      endMin,
      pinned,
      incomingLeg,
      overnight: startMin >= 1440,
    })
    cursor = endMin
  }

  return { rows, totalTravelS }
}
