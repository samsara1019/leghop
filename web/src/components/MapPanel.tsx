import type { ReactNode } from 'react'
import {
  APILoadingStatus,
  Map,
  AdvancedMarker,
  Pin,
  useApiLoadingStatus,
} from '@vis.gl/react-google-maps'
import { GOOGLE_MAPS_MAP_ID } from '../lib/env'

/** 환경 점검용 좌표 — 설계서 예시가 바르셀로나라 그대로 쓴다 */
const BARCELONA = { lat: 41.3874, lng: 2.1686 }

/** 환경 점검 화면 전용. 실제 장소 지도는 PlacesMap을 쓴다. */
export function MapPanel() {
  return (
    // 높이를 flex 체인으로 물려받게 두면 0px로 접혀서 지도가 안 보인다.
    // 구글 지도는 컨테이너 높이가 확정돼야 렌더링되므로 여기서 못박는다.
    <div className="relative h-[420px] w-full">
      <Map
        defaultCenter={BARCELONA}
        defaultZoom={13}
        mapId={GOOGLE_MAPS_MAP_ID || undefined}
        gestureHandling="greedy"
        fullscreenControl={false}
        streetViewControl={false}
        mapTypeControl={false}
        style={{ width: '100%', height: '100%' }}
      >
        {GOOGLE_MAPS_MAP_ID && (
          <AdvancedMarker position={BARCELONA} title="Barcelona">
            <Pin background="#2563eb" borderColor="#1e40af" glyphColor="#fff" />
          </AdvancedMarker>
        )}
      </Map>
      <LoadingOverlay />
    </div>
  )
}

/**
 * 지도가 안 뜰 때 원인을 화면에서 바로 알 수 있게 한다.
 * 콘솔을 열지 않으면 "빈 화면"과 "인증 실패"가 구분이 안 된다.
 */
function LoadingOverlay() {
  const status = useApiLoadingStatus()

  if (status === APILoadingStatus.LOADED) return null

  const message: Record<string, { title: string; hint: ReactNode }> = {
    [APILoadingStatus.NOT_LOADED]: {
      title: '지도 API 로딩 대기 중',
      hint: '잠시 후에도 그대로면 새로고침해 보세요.',
    },
    [APILoadingStatus.LOADING]: {
      title: '지도 API 로딩 중…',
      hint: null,
    },
    [APILoadingStatus.FAILED]: {
      title: '지도 API 로딩 실패',
      hint: '네트워크 차단(광고 차단 확장, 방화벽)이나 오프라인 상태일 수 있습니다.',
    },
    [APILoadingStatus.AUTH_FAILURE]: {
      title: '지도 API 인증 실패',
      hint: (
        <ul className="mt-2 list-disc pl-5 text-left">
          <li>키에 <strong>Maps JavaScript API</strong>가 활성화돼 있는지</li>
          <li>
            HTTP 리퍼러 제한에 <code>http://localhost:5173/*</code>가 들어 있는지
          </li>
          <li>프로젝트에 <strong>결제 계정</strong>이 연결돼 있는지</li>
          <li>Map ID가 이 프로젝트에서 만든 것인지</li>
        </ul>
      ),
    },
  }

  const m = message[status] ?? { title: `알 수 없는 상태: ${status}`, hint: null }

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-slate-100 p-6 text-center text-sm dark:bg-slate-800">
      <p className="font-medium">{m.title}</p>
      {m.hint && (
        <div className="text-slate-500 dark:text-slate-400">{m.hint}</div>
      )}
      <p className="mt-2 text-xs text-slate-400">status: {status}</p>
    </div>
  )
}
