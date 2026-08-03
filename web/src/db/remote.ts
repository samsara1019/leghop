import { requireSupabase } from '../lib/supabase'
import type {
  Day,
  Destination,
  Item,
  Leg,
  LegOption,
  Place,
  PlaceCategory,
  TravelMode,
  Trip,
} from './schema'

/**
 * Supabase 접근 계층.
 *
 * 서버는 snake_case, 클라이언트는 camelCase다. 그 변환을 여기에만 둔다 —
 * 매핑이 여러 파일에 흩어지면 컬럼 하나 바뀔 때 전부 뒤져야 한다.
 *
 * `trip_id`는 days/items/legs에도 비정규화돼 있다. RLS 정책이 조인 없이
 * 판정할 수 있고, 한 여행을 한 번의 쿼리로 긁어올 수 있다.
 */

// ---------- 행 타입 (서버 스키마) ----------

interface TripRow {
  id: string
  owner_id: string
  title: string
  start_date: string
  end_date: string
  currency: string | null
  max_members: number
  created_at: string
  updated_at: string
}

interface DestinationRow {
  id: string
  trip_id: string
  name: string
  lat: number
  lng: number
  start_date: string
  sort_order: number
  country_code: string | null
  timezone: string | null
}

interface PlaceRow {
  id: string
  trip_id: string
  destination_id: string | null
  google_place_id: string | null
  name: string
  name_local: string | null
  category: string
  lat: number
  lng: number
  address: string
  note: string | null
  opening_hours: string[] | null
  price_level: string | null
  tags: string[] | null
  snapshot_at: string
}

interface DayRow {
  id: string
  trip_id: string
  date: string
  sort_order: number
}

interface ItemRow {
  id: string
  trip_id: string
  day_id: string
  sort_order: number
  kind: string
  place_id: string | null
  title: string | null
  start_at: string | null
  duration_min: number
  note: string | null
}

interface LegRow {
  id: string
  trip_id: string
  day_id: string
  from_item_id: string
  to_item_id: string
  selected_mode: string
  alternatives: LegOption[]
  computed_at: string | null
  stale_reason: string | null
}

// ---------- 매핑 ----------

const nz = <T,>(v: T | null | undefined): T | undefined => v ?? undefined

export function toTrip(r: TripRow): Trip & { ownerId: string; maxMembers: number } {
  return {
    id: r.id,
    title: r.title,
    startDate: r.start_date,
    endDate: r.end_date,
    currency: nz(r.currency),
    createdAt: Date.parse(r.created_at),
    updatedAt: Date.parse(r.updated_at),
    ownerId: r.owner_id,
    maxMembers: r.max_members,
  }
}

export function toDestination(r: DestinationRow): Destination {
  return {
    id: r.id,
    tripId: r.trip_id,
    name: r.name,
    lat: r.lat,
    lng: r.lng,
    startDate: r.start_date,
    order: r.sort_order,
    countryCode: nz(r.country_code),
    timezone: nz(r.timezone),
  }
}

export function toPlace(r: PlaceRow): Place {
  return {
    id: r.id,
    tripId: r.trip_id,
    destinationId: nz(r.destination_id),
    googlePlaceId: nz(r.google_place_id),
    name: r.name,
    nameLocal: nz(r.name_local),
    category: r.category as PlaceCategory,
    lat: r.lat,
    lng: r.lng,
    address: r.address,
    note: nz(r.note),
    openingHours: nz(r.opening_hours),
    priceLevel: nz(r.price_level),
    tags: r.tags ?? [],
    snapshotAt: Date.parse(r.snapshot_at),
  }
}

export function toDay(r: DayRow): Day {
  return { id: r.id, tripId: r.trip_id, date: r.date, order: r.sort_order }
}

export function toItem(r: ItemRow): Item {
  return {
    id: r.id,
    dayId: r.day_id,
    order: r.sort_order,
    kind: r.kind as Item['kind'],
    placeId: nz(r.place_id),
    title: nz(r.title),
    startAt: nz(r.start_at),
    durationMin: r.duration_min,
    note: nz(r.note),
  }
}

export function toLeg(r: LegRow): Leg {
  return {
    id: r.id,
    dayId: r.day_id,
    fromItemId: r.from_item_id,
    toItemId: r.to_item_id,
    selectedMode: r.selected_mode as TravelMode,
    alternatives: r.alternatives ?? [],
    computedAt: r.computed_at ? Date.parse(r.computed_at) : 0,
    staleReason: nz(r.stale_reason) as Leg['staleReason'],
  }
}

const iso = (ms: number | undefined) =>
  ms && ms > 0 ? new Date(ms).toISOString() : null

/**
 * PostgrestError는 Error 인스턴스가 아니라 평범한 객체다.
 * 그대로 throw하면 화면에 "[object Object]"만 뜨고 원인을 알 수 없다.
 * code까지 붙여 실제 Error로 감싼다 (42501 = RLS 거부).
 */
function fail(
  error: { message: string; code?: string; details?: string; hint?: string } | null,
  what: string,
): void {
  if (!error) return
  const bits = [error.message]
  if (error.code) bits.push(`code=${error.code}`)
  if (error.hint) bits.push(`hint=${error.hint}`)
  if (error.details) bits.push(error.details)
  throw new Error(`${what} 실패: ${bits.join(' · ')}`)
}

// ---------- 쓰기 가능 여부 ----------

export class OfflineError extends Error {
  constructor() {
    super('offline_read_only')
    this.name = 'OfflineError'
  }
}

/**
 * 오프라인에서는 쓰기를 막는다.
 * 서버가 정본인 모델에서 오프라인 쓰기를 허용하면 결국 충돌 해결이 필요해진다 —
 * 그 복잡도를 피하기로 한 결정이 이 한 줄에 걸려 있다 (DESIGN.md §5).
 */
export function assertWritable(): void {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new OfflineError()
  }
}

export async function currentUserId(): Promise<string> {
  const sb = requireSupabase()
  const { data } = await sb.auth.getSession()
  const id = data.session?.user.id
  if (!id) throw new Error('not_authenticated')
  return id
}

// ---------- 읽기 ----------

export interface TripSnapshot {
  trip: Trip & { ownerId: string; maxMembers: number }
  destinations: Destination[]
  places: Place[]
  days: Day[]
  items: Item[]
  legs: Leg[]
}

/** 내가 볼 수 있는 여행 목록. RLS가 멤버인 것만 돌려준다 */
export async function fetchTrips() {
  const sb = requireSupabase()
  const [{ data: trips, error }, dests] = await Promise.all([
    sb.from('trips').select('*').order('start_date'),
    sb.from('destinations').select('*'),
  ])
  fail(error, 'trips.select')
  fail(dests.error, 'destinations.select')
  return {
    trips: (trips as TripRow[]).map(toTrip),
    destinations: (dests.data as DestinationRow[]).map(toDestination),
  }
}

/** 한 여행을 통째로. 오프라인 미러를 갈아끼우는 데 쓴다 */
export async function fetchTripSnapshot(tripId: string): Promise<TripSnapshot | null> {
  const sb = requireSupabase()
  const [trip, dests, places, days, items, legs] = await Promise.all([
    sb.from('trips').select('*').eq('id', tripId).maybeSingle(),
    sb.from('destinations').select('*').eq('trip_id', tripId),
    sb.from('places').select('*').eq('trip_id', tripId),
    sb.from('days').select('*').eq('trip_id', tripId),
    sb.from('items').select('*').eq('trip_id', tripId),
    sb.from('legs').select('*').eq('trip_id', tripId),
  ])
  const labels = ['trips', 'destinations', 'places', 'days', 'items', 'legs']
  for (const [i, r] of [trip, dests, places, days, items, legs].entries()) {
    fail(r.error, `${labels[i]}.select`)
  }
  if (!trip.data) return null

  return {
    trip: toTrip(trip.data as TripRow),
    destinations: (dests.data as DestinationRow[]).map(toDestination),
    places: (places.data as PlaceRow[]).map(toPlace),
    days: (days.data as DayRow[]).map(toDay),
    items: (items.data as ItemRow[]).map(toItem),
    legs: (legs.data as LegRow[]).map(toLeg),
  }
}

// ---------- 쓰기 ----------
// 서버가 정본이므로 모든 변경은 여기를 먼저 통과한다.

function tripRow(trip: Trip, ownerId: string) {
  return {
    id: trip.id,
    owner_id: ownerId,
    title: trip.title,
    start_date: trip.startDate,
    end_date: trip.endDate,
    currency: trip.currency ?? null,
  }
}

/**
 * 새 여행은 반드시 insert로 넣는다.
 *
 * upsert는 `INSERT ... ON CONFLICT DO UPDATE`로 나가는데, trips는 INSERT와
 * UPDATE 정책이 따로 걸린 유일한 테이블이다(자식 테이블은 `for all` 하나로 묶임).
 * 그래서 upsert가 UPDATE 정책까지 끌어들이고, 새 행을 만들 때조차 그 정책에
 * 발목이 잡힌다. 새로 만드는 경로에 upsert를 쓸 이유가 없다.
 */
export async function insertTrip(trip: Trip, ownerId: string): Promise<void> {
  const sb = requireSupabase()
  const { error } = await sb.from('trips').insert(tripRow(trip, ownerId))
  fail(error, 'trips.insert')
}

/** 이미 있을 수 있는 여행(로컬 데이터 업로드·재시도)에만 쓴다 */
export async function upsertTrip(
  trip: Trip,
  ownerId: string,
): Promise<void> {
  const sb = requireSupabase()
  const { error } = await sb.from('trips').upsert({
    id: trip.id,
    owner_id: ownerId,
    title: trip.title,
    start_date: trip.startDate,
    end_date: trip.endDate,
    currency: trip.currency ?? null,
  })
  fail(error, 'trips.upsert')
}

export async function deleteTripRemote(tripId: string): Promise<void> {
  const sb = requireSupabase()
  const { error } = await sb.from('trips').delete().eq('id', tripId)
  fail(error, 'trips.delete')
}

export async function upsertDestination(d: Destination): Promise<void> {
  const sb = requireSupabase()
  const { error } = await sb.from('destinations').upsert({
    id: d.id,
    trip_id: d.tripId,
    name: d.name,
    lat: d.lat,
    lng: d.lng,
    start_date: d.startDate,
    sort_order: d.order,
    country_code: d.countryCode ?? null,
    timezone: d.timezone ?? null,
  })
  fail(error, 'destinations.upsert')
}

export async function deleteDestinationRemote(id: string): Promise<void> {
  const sb = requireSupabase()
  const { error } = await sb.from('destinations').delete().eq('id', id)
  fail(error, 'destinations.delete')
}

export async function upsertPlace(p: Place): Promise<void> {
  const sb = requireSupabase()
  const { error } = await sb.from('places').upsert({
    id: p.id,
    trip_id: p.tripId,
    destination_id: p.destinationId ?? null,
    google_place_id: p.googlePlaceId ?? null,
    name: p.name,
    name_local: p.nameLocal ?? null,
    category: p.category,
    lat: p.lat,
    lng: p.lng,
    address: p.address,
    note: p.note ?? null,
    opening_hours: p.openingHours ?? null,
    price_level: p.priceLevel ?? null,
    tags: p.tags,
    snapshot_at: new Date(p.snapshotAt).toISOString(),
  })
  fail(error, 'places.upsert')
}

export async function deletePlaceRemote(id: string): Promise<void> {
  const sb = requireSupabase()
  const { error } = await sb.from('places').delete().eq('id', id)
  fail(error, 'places.delete')
}

export async function upsertDays(tripId: string, days: Day[]): Promise<void> {
  if (days.length === 0) return
  const sb = requireSupabase()
  const { error } = await sb.from('days').upsert(
    days.map((d) => ({
      id: d.id,
      trip_id: tripId,
      date: d.date,
      sort_order: d.order,
    })),
    // 같은 여행·같은 날짜는 하나뿐이다. 다른 기기에서 먼저 만들었으면 그걸 쓴다
    { onConflict: 'trip_id,date' },
  )
  fail(error, 'days.upsert')
}

export async function deleteDaysRemote(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const sb = requireSupabase()
  const { error } = await sb.from('days').delete().in('id', ids)
  fail(error, 'days.delete')
}

export async function upsertItems(tripId: string, items: Item[]): Promise<void> {
  if (items.length === 0) return
  const sb = requireSupabase()
  const { error } = await sb.from('items').upsert(
    items.map((i) => ({
      id: i.id,
      trip_id: tripId,
      day_id: i.dayId,
      sort_order: i.order,
      kind: i.kind,
      place_id: i.placeId ?? null,
      title: i.title ?? null,
      start_at: i.startAt ?? null,
      duration_min: i.durationMin,
      note: i.note ?? null,
    })),
  )
  fail(error, 'items.upsert')
}

export async function deleteItemsRemote(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const sb = requireSupabase()
  const { error } = await sb.from('items').delete().in('id', ids)
  fail(error, 'items.delete')
}

export async function upsertLegs(tripId: string, legs: Leg[]): Promise<void> {
  if (legs.length === 0) return
  const sb = requireSupabase()
  const { error } = await sb.from('legs').upsert(
    legs.map((l) => ({
      id: l.id,
      trip_id: tripId,
      day_id: l.dayId,
      from_item_id: l.fromItemId,
      to_item_id: l.toItemId,
      selected_mode: l.selectedMode,
      alternatives: l.alternatives,
      computed_at: iso(l.computedAt),
      stale_reason: l.staleReason ?? null,
    })),
    { onConflict: 'day_id,from_item_id,to_item_id' },
  )
  fail(error, 'legs.upsert')
}

export async function deleteLegsRemote(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const sb = requireSupabase()
  const { error } = await sb.from('legs').delete().in('id', ids)
  fail(error, 'legs.delete')
}

// ---------- 공유 ----------

export interface MemberRow {
  userId: string | null
  email: string | null
  displayName: string | null
  avatarUrl: string | null
  role: 'owner' | 'editor' | 'viewer'
  isPending: boolean
}

export async function fetchMembers(tripId: string): Promise<MemberRow[]> {
  const sb = requireSupabase()
  const { data, error } = await sb.rpc('trip_member_list', { p_trip: tripId })
  fail(error, 'trip_member_list')
  return (
    data as {
      user_id: string | null
      email: string | null
      display_name: string | null
      avatar_url: string | null
      role: MemberRow['role']
      is_pending: boolean
    }[]
  ).map((r) => ({
    userId: r.user_id,
    email: r.email,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    role: r.role,
    isPending: r.is_pending,
  }))
}

export type InviteResult = 'added' | 'invited' | 'already_member'

export async function inviteMember(
  tripId: string,
  email: string,
): Promise<InviteResult> {
  const sb = requireSupabase()
  const { data, error } = await sb.rpc('invite_to_trip', {
    p_trip: tripId,
    p_email: email,
    p_role: 'editor',
  })
  fail(error, 'invite_to_trip')
  return data as InviteResult
}

export async function removeMember(tripId: string, userId: string): Promise<void> {
  const sb = requireSupabase()
  const { error } = await sb
    .from('trip_members')
    .delete()
    .eq('trip_id', tripId)
    .eq('user_id', userId)
  fail(error, 'trip_members.delete')
}

export async function cancelInvite(tripId: string, email: string): Promise<void> {
  const sb = requireSupabase()
  const { error } = await sb
    .from('trip_invites')
    .delete()
    .eq('trip_id', tripId)
    .eq('email', email.toLowerCase())
  fail(error, 'trip_invites.delete')
}
