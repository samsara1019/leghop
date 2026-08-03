import { AdvancedMarker, Map, Pin } from '@vis.gl/react-google-maps'
import { GOOGLE_MAPS_MAP_ID } from '../lib/env'
import { CATEGORIES } from '../lib/categories'
import type { Place } from '../db/schema'

interface Props {
  center: { lat: number; lng: number }
  places: Place[]
  /** 켜면 지도 클릭이 "여기에 장소 추가"가 된다 */
  pickMode?: boolean
  onPick?: (position: { lat: number; lng: number }) => void
  selectedId?: string | null
  onSelect?: (placeId: string) => void
  height?: number
}

export function PlacesMap({
  center,
  places,
  pickMode = false,
  onPick,
  selectedId,
  onSelect,
  height = 280,
}: Props) {
  return (
    <div className="relative w-full" style={{ height }}>
      <Map
        defaultCenter={center}
        defaultZoom={13}
        mapId={GOOGLE_MAPS_MAP_ID || undefined}
        gestureHandling="greedy"
        fullscreenControl={false}
        streetViewControl={false}
        mapTypeControl={false}
        clickableIcons={!pickMode}
        style={{ width: '100%', height: '100%' }}
        onClick={(e) => {
          if (!pickMode || !onPick) return
          const ll = e.detail.latLng
          if (ll) onPick({ lat: ll.lat, lng: ll.lng })
        }}
      >
        {GOOGLE_MAPS_MAP_ID &&
          places.map((p) => {
            const cat = CATEGORIES[p.category]
            const active = p.id === selectedId
            return (
              <AdvancedMarker
                key={p.id}
                position={{ lat: p.lat, lng: p.lng }}
                title={p.name}
                onClick={() => onSelect?.(p.id)}
              >
                <Pin
                  background={cat.color}
                  borderColor={active ? '#0f172a' : cat.color}
                  glyphColor="#fff"
                  scale={active ? 1.3 : 1}
                />
              </AdvancedMarker>
            )
          })}
      </Map>

      {pickMode && (
        <div className="pointer-events-none absolute inset-x-0 top-0 bg-sky-600/90 px-3 py-2 text-center text-xs font-medium text-white">
          지도를 눌러 장소를 추가하세요
        </div>
      )}

      {!GOOGLE_MAPS_MAP_ID && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-amber-500/90 px-3 py-1.5 text-center text-xs text-white">
          Map ID가 없어 핀이 표시되지 않습니다
        </div>
      )}
    </div>
  )
}
