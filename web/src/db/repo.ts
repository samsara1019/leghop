import {
  db,
  newId,
  type Destination,
  type Place,
  type PlaceCategory,
  type Trip,
} from './schema'
import {
  assertWritable,
  currentUserId,
  deleteDestinationRemote,
  deletePlaceRemote,
  deleteTripRemote,
  insertTrip,
  upsertDestination,
  upsertPlace,
} from './remote'

/**
 * 모든 변경은 **서버에 먼저 쓰고, 성공하면 로컬 미러에 반영**한다.
 *
 * 순서가 중요하다. 로컬을 먼저 고치면 서버 쓰기가 실패했을 때 화면에는
 * 반영됐는데 실제로는 저장되지 않은 상태가 된다 — 사용자가 알 방법이 없다.
 */

// ---------- Trip ----------

export interface NewTripInput {
  title: string
  startDate: string
  endDate: string
  /** 첫 목적지. 여행은 최소 한 도시로 시작한다 */
  firstCity: { name: string; lat: number; lng: number }
}

export async function createTrip(input: NewTripInput): Promise<string> {
  assertWritable()
  const ownerId = await currentUserId()
  const now = Date.now()
  const trip: Trip = {
    id: newId(),
    title: input.title,
    startDate: input.startDate,
    endDate: input.endDate,
    createdAt: now,
    updatedAt: now,
  }
  const dest: Destination = {
    id: newId(),
    tripId: trip.id,
    name: input.firstCity.name,
    lat: input.firstCity.lat,
    lng: input.firstCity.lng,
    startDate: input.startDate,
    order: 0,
  }

  // owner 멤버십은 서버 트리거가 붙인다 (0001_init.sql: add_owner_as_member)
  await insertTrip(trip, ownerId)
  await upsertDestination(dest)

  await db.transaction('rw', [db.trips, db.destinations], async () => {
    await db.trips.add(trip)
    await db.destinations.add(dest)
  })
  return trip.id
}

/** 소유자만 지울 수 있다 (RLS). 서버에서 딸린 것들이 cascade로 함께 지워진다. */
export async function deleteTrip(tripId: string): Promise<void> {
  assertWritable()
  await deleteTripRemote(tripId)

  await db.transaction(
    'rw',
    [db.trips, db.destinations, db.places, db.days, db.items, db.legs],
    async () => {
      const dayIds = await db.days.where('tripId').equals(tripId).primaryKeys()
      if (dayIds.length) {
        const itemIds = await db.items.where('dayId').anyOf(dayIds).primaryKeys()
        await db.legs.where('dayId').anyOf(dayIds).delete()
        await db.items.bulkDelete(itemIds)
        await db.days.bulkDelete(dayIds)
      }
      await db.places.where('tripId').equals(tripId).delete()
      await db.destinations.where('tripId').equals(tripId).delete()
      await db.trips.delete(tripId)
    },
  )
}

// ---------- Destination ----------

export async function addDestination(
  tripId: string,
  city: { name: string; lat: number; lng: number },
  startDate: string,
): Promise<string> {
  assertWritable()
  const count = await db.destinations.where('tripId').equals(tripId).count()
  const dest: Destination = {
    id: newId(),
    tripId,
    name: city.name,
    lat: city.lat,
    lng: city.lng,
    startDate,
    order: count,
  }
  await upsertDestination(dest)
  await db.destinations.add(dest)
  await renumber(tripId)
  return dest.id
}

export async function updateDestination(
  id: string,
  patch: Partial<Pick<Destination, 'name' | 'lat' | 'lng' | 'startDate'>>,
): Promise<void> {
  assertWritable()
  const dest = await db.destinations.get(id)
  if (!dest) return
  const next = { ...dest, ...patch }
  await upsertDestination(next)
  await db.destinations.put(next)
  if (patch.startDate) await renumber(dest.tripId)
}

/**
 * 마지막 목적지는 지울 수 없다. 목적지가 하나도 없으면 지도 중심과
 * 검색 편향이 사라져서 장소 추가가 사실상 불가능해진다.
 */
export async function deleteDestination(id: string): Promise<'ok' | 'last'> {
  const dest = await db.destinations.get(id)
  if (!dest) return 'ok'
  const count = await db.destinations.where('tripId').equals(dest.tripId).count()
  if (count <= 1) return 'last'

  assertWritable()
  // 서버에서 places.destination_id는 on delete set null이므로 장소는 살아남는다
  await deleteDestinationRemote(id)

  await db.transaction('rw', [db.destinations, db.places], async () => {
    await db.destinations.delete(id)
    await db.places
      .where('destinationId')
      .equals(id)
      .modify({ destinationId: undefined })
  })
  await renumber(dest.tripId)
  return 'ok'
}

async function renumber(tripId: string): Promise<void> {
  const all = await db.destinations.where('tripId').equals(tripId).toArray()
  all.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.order - b.order)
  const changed = all
    .map((d, i) => ({ ...d, order: i }))
    .filter((d, i) => all[i].order !== d.order)
  if (changed.length === 0) return
  await Promise.all(changed.map((d) => upsertDestination(d)))
  await db.destinations.bulkPut(changed)
}

// ---------- Place ----------

export interface NewPlaceInput {
  tripId: string
  destinationId?: string
  name: string
  category: PlaceCategory
  lat: number
  lng: number
  address?: string
  googlePlaceId?: string
  nameLocal?: string
  note?: string
  openingHours?: string[]
  priceLevel?: string
}

export async function addPlace(input: NewPlaceInput): Promise<string> {
  assertWritable()
  const place: Place = {
    id: newId(),
    tripId: input.tripId,
    destinationId: input.destinationId,
    googlePlaceId: input.googlePlaceId,
    name: input.name,
    nameLocal: input.nameLocal,
    category: input.category,
    lat: input.lat,
    lng: input.lng,
    address: input.address ?? '',
    note: input.note,
    openingHours: input.openingHours,
    priceLevel: input.priceLevel,
    tags: [],
    snapshotAt: Date.now(),
  }
  await upsertPlace(place)
  await db.places.add(place)
  return place.id
}

export async function updatePlace(
  id: string,
  patch: Partial<Omit<Place, 'id' | 'tripId'>>,
): Promise<void> {
  assertWritable()
  const cur = await db.places.get(id)
  if (!cur) return
  const next = { ...cur, ...patch }
  await upsertPlace(next)
  await db.places.put(next)
}

export async function deletePlace(id: string): Promise<void> {
  assertWritable()
  await deletePlaceRemote(id)
  // 서버에서 이 장소를 쓰던 일정 항목이 cascade로 지워진다. 미러도 맞춰준다.
  await db.transaction('rw', [db.places, db.items, db.legs], async () => {
    const items = await db.items.where('placeId').equals(id).toArray()
    for (const it of items) {
      await db.legs
        .where('dayId')
        .equals(it.dayId)
        .filter((l) => l.fromItemId === it.id || l.toItemId === it.id)
        .delete()
    }
    await db.items.bulkDelete(items.map((i) => i.id))
    await db.places.delete(id)
  })
}

/** 같은 여행에 같은 장소를 두 번 넣는 걸 막는다 */
export async function findPlaceByGoogleId(
  tripId: string,
  googlePlaceId: string,
): Promise<Place | undefined> {
  return db.places
    .where('googlePlaceId')
    .equals(googlePlaceId)
    .filter((p) => p.tripId === tripId)
    .first()
}
