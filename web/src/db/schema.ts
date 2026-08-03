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
  city: string
  /** 지도 초기 중심 + Places 검색 지역 편향에 쓴다 */
  lat: number
  lng: number
  countryCode?: string
  timezone?: string
  /** YYYY-MM-DD */
  startDate: string
  /** YYYY-MM-DD */
  endDate: string
  currency?: string
  createdAt: number
  updatedAt: number
}

export interface Place {
  id: string
  tripId: string
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

const db = new Dexie('leghop') as Dexie & {
  trips: EntityTable<Trip, 'id'>
  places: EntityTable<Place, 'id'>
  days: EntityTable<Day, 'id'>
  items: EntityTable<Item, 'id'>
  legs: EntityTable<Leg, 'id'>
}

db.version(1).stores({
  trips: 'id, startDate, updatedAt',
  places: 'id, tripId, category, googlePlaceId, [tripId+category]',
  days: 'id, tripId, date, [tripId+order]',
  items: 'id, dayId, placeId, [dayId+order]',
  legs: 'id, dayId, fromItemId, toItemId, [dayId+fromItemId]',
})

export { db }

/** crypto.randomUUID는 보안 컨텍스트(https/localhost)에서만 있다 */
export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
