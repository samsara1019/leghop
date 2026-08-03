import type { LegOption, LegStep, TravelMode } from '../db/schema'

/**
 * Directions API 래퍼.
 *
 * 비용 방어 (DESIGN.md §7.2): 자동 계산은 **주 수단 1개만** 부른다.
 * 대안 수단은 사용자가 비교를 눌렀을 때만 추가로 부르고, 그 결과는 Leg에 캐시된다.
 */

const MODE_REQUEST: Record<TravelMode, google.maps.TravelModeString> = {
  transit: 'TRANSIT',
  walking: 'WALKING',
  driving: 'DRIVING',
  bicycling: 'BICYCLING',
}

export const MODE_LABEL: Record<TravelMode, string> = {
  transit: '대중교통',
  walking: '도보',
  driving: '택시·차',
  bicycling: '자전거',
}

export const MODE_EMOJI: Record<TravelMode, string> = {
  transit: '🚌',
  walking: '🚶',
  driving: '🚕',
  bicycling: '🚲',
}

/** 지도 폴리라인 색. Polyline은 CSS 변수를 못 읽으므로 값으로 둔다. */
export const MODE_COLOR: Record<TravelMode, string> = {
  transit: '#3b82f6',
  walking: '#22c55e',
  driving: '#f97316',
  bicycling: '#a855f7',
}

export const ALL_MODES: TravelMode[] = ['transit', 'walking', 'driving', 'bicycling']

/**
 * Directions의 instructions는 HTML이다. 오프라인에서 그대로 쓸 수 있게 평문으로 바꾼다.
 * innerHTML 대신 DOMParser를 쓴다 — 스크립트/이미지 로딩이 일어나지 않는다.
 */
export function stripHtml(html: string): string {
  // 구글은 하위 지시문을 <div>로 나눠 보낸다. 태그를 그냥 지우면 단어가 붙으므로
  // 눈에 안 띄는 구분자를 심어두고 마지막에 " · "로 바꾼다.
  const SEP = '\u0001'
  const prepared = html.replace(/<\/?(div|br|p)[^>]*>/gi, SEP)
  const doc = new DOMParser().parseFromString(prepared, 'text/html')
  return (doc.body.textContent ?? '')
    .split(SEP)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' · ')
}

function transitStepText(s: google.maps.DirectionsStep): string | null {
  const t = s.transit ?? s.transit_details
  if (!t) return null
  const line = t.line?.short_name || t.line?.name || ''
  const from = t.departure_stop?.name ?? ''
  const to = t.arrival_stop?.name ?? ''
  const stops = t.num_stops ? ` · ${t.num_stops}개 정류장` : ''
  const head = [line, t.headsign].filter(Boolean).join(' ')
  return `${head} 탑승: ${from} → ${to}${stops}`.trim()
}

function buildLabel(mode: TravelMode, leg: google.maps.DirectionsLeg): string {
  if (mode !== 'transit') return MODE_LABEL[mode]
  const lines = leg.steps
    .map((s) => s.transit ?? s.transit_details)
    .map((t) => t?.line?.short_name || t?.line?.name)
    .filter((v): v is string => Boolean(v))
  return lines.length ? lines.join(' → ') : MODE_LABEL.transit
}

export interface RouteQuery {
  from: { lat: number; lng: number }
  to: { lat: number; lng: number }
  mode: TravelMode
  /** 대중교통은 출발 시각에 따라 결과가 달라진다 */
  departAt?: Date
}

/** 경로를 찾지 못하면 null. ZERO_RESULTS는 정상적인 결과다(섬↔육지 도보 등). */
export async function fetchRoute(
  service: google.maps.DirectionsService,
  q: RouteQuery,
): Promise<LegOption | null> {
  let result: google.maps.DirectionsResult
  try {
    result = await service.route({
      origin: q.from,
      destination: q.to,
      travelMode: MODE_REQUEST[q.mode],
      language: 'ko',
      ...(q.mode === 'transit' && q.departAt
        ? { transitOptions: { departureTime: q.departAt } }
        : {}),
    })
  } catch {
    return null
  }

  const route = result.routes[0]
  const leg = route?.legs[0]
  if (!route || !leg) return null

  const steps: LegStep[] = leg.steps.map((s) => {
    const transit = transitStepText(s)
    const plain = stripHtml(s.instructions ?? '')
    return {
      text: transit ? (plain ? `${plain} — ${transit}` : transit) : plain,
      distanceM: s.distance?.value ?? 0,
      durationS: s.duration?.value ?? 0,
      maneuver: s.maneuver || undefined,
    }
  })

  return {
    mode: q.mode,
    label: buildLabel(q.mode, leg),
    distanceM: leg.distance?.value ?? 0,
    durationS: leg.duration?.value ?? 0,
    fareText: route.fare?.text,
    polyline: route.overview_polyline,
    steps,
  }
}
