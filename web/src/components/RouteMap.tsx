import { useEffect } from 'react'
import { AdvancedMarker, Map, Pin, useMap, useMapsLibrary } from '@vis.gl/react-google-maps'
import { GOOGLE_MAPS_MAP_ID } from '../lib/env'

interface Props {
  encodedPolyline: string
  from: { lat: number; lng: number }
  to: { lat: number; lng: number }
  height?: number
}

/** 경로 폴리라인을 그린다. @vis.gl에 Polyline 컴포넌트가 없어 명령형으로 붙인다. */
function PolylineOverlay({ encoded }: { encoded: string }) {
  const map = useMap()
  const geometry = useMapsLibrary('geometry')

  useEffect(() => {
    if (!map || !geometry || !encoded) return

    const path = geometry.encoding.decodePath(encoded)
    const line = new google.maps.Polyline({
      path,
      strokeColor: '#0ea5e9',
      strokeOpacity: 0.9,
      strokeWeight: 5,
    })
    line.setMap(map)

    const bounds = new google.maps.LatLngBounds()
    for (const p of path) bounds.extend(p)
    if (!bounds.isEmpty()) map.fitBounds(bounds, 40)

    return () => line.setMap(null)
  }, [map, geometry, encoded])

  return null
}

export function RouteMap({ encodedPolyline, from, to, height = 240 }: Props) {
  return (
    <div style={{ height }} className="w-full">
      <Map
        defaultCenter={from}
        defaultZoom={13}
        mapId={GOOGLE_MAPS_MAP_ID || undefined}
        gestureHandling="greedy"
        fullscreenControl={false}
        streetViewControl={false}
        mapTypeControl={false}
        style={{ width: '100%', height: '100%' }}
      >
        <PolylineOverlay encoded={encodedPolyline} />
        {GOOGLE_MAPS_MAP_ID && (
          <>
            <AdvancedMarker position={from} title="출발">
              <Pin background="#22c55e" borderColor="#15803d" glyphColor="#fff" />
            </AdvancedMarker>
            <AdvancedMarker position={to} title="도착">
              <Pin background="#ef4444" borderColor="#b91c1c" glyphColor="#fff" />
            </AdvancedMarker>
          </>
        )}
      </Map>
    </div>
  )
}
