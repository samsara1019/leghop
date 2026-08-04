import Dexie, { type EntityTable } from 'dexie'

/**
 * DESIGN.md §4 데이터 모델.
 * IndexedDB가 정본이다 — 서버 동기화는 v2 범위.
 */

export type PlaceCategory =
  | 'lodging'
  | 'food'
  | 'sight'
  | 'shop'
  | 'transport'
  | 'custom'

export type TravelMode = 'transit' | 'walking' | 'driving' | 'bicycling'

export type ItemKind = 'stop' | 'activity'

export interface Trip {
  id: string
  title: string
  /** YYYY-MM-DD */
  startDate: string
  /** YYYY-MM-DD */
  endDate: string
  currency?: string
  createdAt: number
  updatedAt: number
}

/**
 * 여행 중 머무는 도시. 한 여행에 여러 개 (바르셀로나 → 세비야 → 마요르카).
 *
 * **종료일을 두지 않는다.** 다음 목적지의 startDate가 곧 이전 목적지의 끝이다.
 * 종료일을 따로 두면 기간이 겹치거나 빈 날이 생기고, 그 예외를 전부 다뤄야 한다.
 */
export interface Destination {
  id: string
  tripId: string
  name: string
  /** 지도 중심 + Places 검색 지역 편향 */
  lat: number
  lng: number
  /** 이 도시에 머무는 첫날. YYYY-MM-DD */
  startDate: string
  order: number
  countryCode?: string
  timezone?: string
}

export interface Place {
  id: string
  tripId: string
  /** 어느 도시의 장소인가. 마이그레이션 전 데이터에는 없을 수 있다 */
  destinationId?: string
  /** Google place_id는 약관상 무기한 보관 가능 (DESIGN.md §7.1-1) */
  googlePlaceId?: string
  name: string
  /** 원어 표기. "라 플라우타" ↔ "La Flauta" */
  nameLocal?: string
  category: PlaceCategory
  lat: number
  lng: number
  address: string
  note?: string
  openingHours?: string[]
  /** 신규 Places API는 숫자가 아니라 'MODERATE' 같은 문자열 enum을 준다 */
  priceLevel?: string
  tags: string[]
  /** Places 스냅샷 취득 시각. 30일 TTL 판정 기준 (DESIGN.md §7.1-1) */
  snapshotAt: number
}

export interface Day {
  id: string
  tripId: string
  /** YYYY-MM-DD */
  date: string
  order: number
}

export interface Item {
  id: string
  dayId: string
  order: number
  kind: ItemKind
  /** kind === 'stop' 일 때만 */
  placeId?: string
  /** kind === 'activity' 일 때만. 예: "입국 심사 및 짐 찾기" */
  title?: string
  /** HH:mm */
  startAt?: string
  durationMin: number
  note?: string
}

export interface LegStep {
  text: string
  distanceM: number
  durationS: number
  maneuver?: string
}

export interface LegOption {
  mode: TravelMode
  /** "Aerobus A1", "도보" 처럼 사람이 읽는 라벨 */
  label: string
  distanceM: number
  durationS: number
  fareText?: string
  /** encoded polyline — 온라인 지도 렌더링용 */
  polyline: string
  /** 오프라인에서 실제로 쓰이는 본체 (DESIGN.md §5) */
  steps: LegStep[]
}

export type LegStaleReason =
  | 'place-changed'
  | 'order-changed'
  | 'time-shifted'
  | 'expired'

export interface Leg {
  id: string
  dayId: string
  fromItemId: string
  toItemId: string
  selectedMode: TravelMode
  alternatives: LegOption[]
  computedAt: number
  staleReason?: LegStaleReason
}

export interface PackingItem {
  id: string
  tripId: string
  category: string
  name: string
  note?: string
  checked: boolean
  order: number
  /** template = 템플릿 생성분, custom = 사용자 추가. 재생성 시 custom을 보존한다 */
  source: 'template' | 'custom'
}

export type DocumentCategory =
  | 'voucher'
  | 'ticket'
  | 'lodging'
  | 'insurance'
  | 'id'
  | 'other'

export interface TripDocument {
  id: string
  tripId: string
  title: string
  category: DocumentCategory
  fileName: string
  mimeType: string
  sizeBytes: number
  /** documents 버킷 안의 경로. {tripId}/{id} */
  storagePath: string
  note?: string
  createdAt: number
}

/**
 * 서류 파일 본체. 메타데이터와 **분리한 테이블**에 둔다.
 * 목록을 그릴 때마다 수 MB짜리 Blob을 함께 읽어오면 화면이 느려진다.
 */
export interface DocumentBlob {
  /** TripDocument.id와 같다 */
  id: string
  tripId: string
  blob: Blob
  cachedAt: number
}

const db = new Dexie('leghop') as Dexie & {
  trips: EntityTable<Trip, 'id'>
  destinations: EntityTable<Destination, 'id'>
  places: EntityTable<Place, 'id'>
  days: EntityTable<Day, 'id'>
  items: EntityTable<Item, 'id'>
  legs: EntityTable<Leg, 'id'>
  packingItems: EntityTable<PackingItem, 'id'>
  documents: EntityTable<TripDocument, 'id'>
  documentBlobs: EntityTable<DocumentBlob, 'id'>
}

db.version(1).stores({
  trips: 'id, startDate, updatedAt',
  places: 'id, tripId, category, googlePlaceId, [tripId+category]',
  days: 'id, tripId, date, [tripId+order]',
  items: 'id, dayId, placeId, [dayId+order]',
  legs: 'id, dayId, fromItemId, toItemId, [dayId+fromItemId]',
})

/** v2: 여러 도시를 도는 여행 지원. Trip의 city/lat/lng를 Destination으로 옮긴다. */
db.version(2)
  .stores({
    destinations: 'id, tripId, startDate, [tripId+order]',
    places: 'id, tripId, destinationId, category, googlePlaceId, [tripId+category]',
  })
  .upgrade(async (tx) => {
    interface LegacyTrip {
      id: string
      city?: string
      lat?: number
      lng?: number
      startDate: string
    }
    const trips = (await tx.table('trips').toArray()) as LegacyTrip[]
    for (const t of trips) {
      // 좌표가 없던 여행은 목적지를 만들 수 없다 — 사용자가 직접 추가하게 둔다
      if (typeof t.lat !== 'number' || typeof t.lng !== 'number') continue
      const id = newId()
      await tx.table('destinations').add({
        id,
        tripId: t.id,
        name: t.city ?? '목적지',
        lat: t.lat,
        lng: t.lng,
        startDate: t.startDate,
        order: 0,
      })
      await tx
        .table('places')
        .where('tripId')
        .equals(t.id)
        .modify({ destinationId: id })
    }
  })

/** v3: 여행 준비물 체크리스트 */
db.version(3).stores({
  packingItems: 'id, tripId, category, [tripId+order]',
})

/** v4: 서류보관함. 파일 본체는 오프라인 열람용으로 Blob째 캐시한다 */
db.version(4).stores({
  documents: 'id, tripId, category, createdAt',
  documentBlobs: 'id, tripId',
})

export { db }

/** crypto.randomUUID는 보안 컨텍스트(https/localhost)에서만 있다 */
export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
