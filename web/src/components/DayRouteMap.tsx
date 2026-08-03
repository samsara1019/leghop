import { useEffect, useRef } from 'react'
// Map을 그대로 들여오면 JS 내장 Map 생성자를 가린다 (아래에서 new Map()을 쓴다)
import {
  AdvancedMarker,
  Map as GoogleMap,
  Pin,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps'
import { GOOGLE_MAPS_MAP_ID } from '../lib/env'
import { CATEGORIES } from '../lib/categories'
import { MODE_COLOR } from '../lib/directions'
import type { Place, TravelMode } from '../db/schema'

export interface DayStopMarker {
  itemId: string
  place: Place
}

export interface DayLegLine {
  legId: string
  mode: TravelMode
  polyline: string
}

interface Props {
  stops: DayStopMarker[]
  lines: DayLegLine[]
  selectedLegId: string | null
  onSelectLeg: (legId: string | null) => void
  center: { lat: number; lng: number }
  height?: number
}

/**
 * 하루 동선 전체를 한 지도에 그린다.
 * 정거장은 방문 순서 번호로, 구간은 수단 색 폴리라인으로 표시하고
 * 선택된 구간만 굵고 진하게 강조한다.
 */
export function DayRouteMap({
  stops,
  lines,
  selectedLegId,
  onSelectLeg,
  center,
  height = 300,
}: Props) {
  return (
    <div style={{ height }} className="w-full">
      <GoogleMap
        defaultCenter={center}
        defaultZoom={12}
        mapId={GOOGLE_MAPS_MAP_ID || undefined}
        gestureHandling="greedy"
        fullscreenControl={false}
        streetViewControl={false}
        mapTypeControl={false}
        style={{ width: '100%', height: '100%' }}
        // 빈 곳을 누르면 강조를 해제한다
        onClick={() => onSelectLeg(null)}
      >
        <LegLines
          lines={lines}
          stops={stops}
          selectedLegId={selectedLegId}
          onSelectLeg={onSelectLeg}
        />

        {GOOGLE_MAPS_MAP_ID &&
          stops.map((s, i) => (
            <AdvancedMarker
              key={s.itemId}
              position={{ lat: s.place.lat, lng: s.place.lng }}
              title={`${i + 1}. ${s.place.name}`}
              zIndex={100}
            >
              <Pin
                background={CATEGORIES[s.place.category].color}
                borderColor="#0f172a"
                glyphColor="#fff"
                glyph={String(i + 1)}
              />
            </AdvancedMarker>
          ))}
      </GoogleMap>
    </div>
  )
}

function LegLines({
  lines,
  stops,
  selectedLegId,
  onSelectLeg,
}: {
  lines: DayLegLine[]
  stops: DayStopMarker[]
  selectedLegId: string | null
  onSelectLeg: (legId: string) => void
}) {
  const map = useMap()
  const geometry = useMapsLibrary('geometry')
  const polysRef = useRef(new Map<string, google.maps.Polyline>())

  // 클릭 콜백을 의존성에 넣으면 선을 매번 다시 그리게 된다. ref로 최신값만 참조한다.
  const onSelectRef = useRef(onSelectLeg)
  onSelectRef.current = onSelectLeg

  // 선 생성/파괴 + 화면 맞추기. 선택이 바뀔 때는 돌지 않아야 한다 —
  // 매번 fitBounds가 불리면 구간을 누를 때마다 지도가 튄다.
  useEffect(() => {
    if (!map || !geometry) return

    const polys = new Map<string, google.maps.Polyline>()
    const bounds = new google.maps.LatLngBounds()

    for (const line of lines) {
      const path = geometry.encoding.decodePath(line.polyline)
      for (const p of path) bounds.extend(p)

      const poly = new google.maps.Polyline({
        path,
        strokeColor: MODE_COLOR[line.mode],
        strokeOpacity: 0.9,
        strokeWeight: 5,
        clickable: true,
      })
      poly.setMap(map)
      poly.addListener('click', () => onSelectRef.current(line.legId))
      polys.set(line.legId, poly)
    }

    polysRef.current = polys

    // 아직 경로가 없어도 정거장만으로 화면을 맞춘다
    for (const s of stops) bounds.extend({ lat: s.place.lat, lng: s.place.lng })
    if (!bounds.isEmpty()) map.fitBounds(bounds, 48)

    return () => {
      for (const p of polys.values()) {
        google.maps.event.clearInstanceListeners(p)
        p.setMap(null)
      }
      polysRef.current = new Map()
    }
  }, [map, geometry, lines, stops])

  // 강조 표시만 갱신한다. 위 효과가 먼저 돌아 선이 준비된 뒤 실행된다.
  useEffect(() => {
    for (const [legId, poly] of polysRef.current) {
      const active = selectedLegId === legId
      const dimmed = selectedLegId !== null && !active
      poly.setOptions({
        strokeOpacity: dimmed ? 0.25 : 0.9,
        strokeWeight: active ? 8 : 5,
        zIndex: active ? 10 : 1,
      })
    }
  }, [selectedLegId, lines])

  return null
}
