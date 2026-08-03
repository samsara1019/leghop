import {
  db,
  newId,
  type Destination,
  type Place,
  type PlaceCategory,
  type Trip,
} from './schema'

// ---------- Trip ----------

export interface NewTripInput {
  title: string
  startDate: string
  endDate: string
  /** 첫 목적지. 여행은 최소 한 도시로 시작한다 */
  firstCity: { name: string; lat: number; lng: number }
}

export async function createTrip(input: NewTripInput): Promise<string> {
  const now = Date.now()
  const tripId = newId()
  await db.transaction('rw', db.trips, db.destinations, async () => {
    const trip: Trip = {
      id: tripId,
      title: input.title,
      startDate: input.startDate,
      endDate: input.endDate,
      createdAt: now,
      updatedAt: now,
    }
    await db.trips.add(trip)
    await db.destinations.add({
      id: newId(),
      tripId,
      name: input.firstCity.name,
      lat: input.firstCity.lat,
      lng: input.firstCity.lng,
      startDate: input.startDate,
      order: 0,
    })
  })
  return tripId
}

/** 여행을 지우면 딸린 것도 전부 지운다. 고아 레코드가 남으면 용량만 먹는다. */
export async function deleteTrip(tripId: string): Promise<void> {
  // 테이블이 5개를 넘으면 가변 인자 오버로드가 없다 — 배열 형태를 쓴다
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
  const id = newId()
  await db.transaction('rw', db.destinations, async () => {
    const existing = await db.destinations.where('tripId').equals(tripId).count()
    await db.destinations.add({
      id,
      tripId,
      name: city.name,
      lat: city.lat,
      lng: city.lng,
      startDate,
      order: existing,
    })
    await renumber(tripId)
  })
  return id
}

export async function updateDestination(
  id: string,
  patch: Partial<Pick<Destination, 'name' | 'lat' | 'lng' | 'startDate'>>,
): Promise<void> {
  const dest = await db.destinations.get(id)
  if (!dest) return
  await db.destinations.update(id, patch)
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

  await db.transaction('rw', db.destinations, db.places, async () => {
    await db.destinations.delete(id)
    // 이 도시에 매인 장소는 남기고 소속만 푼다 — 사용자가 넣은 데이터를 지우지 않는다
    await db.places.where('destinationId').equals(id).modify({ destinationId: undefined })
    await renumber(dest.tripId)
  })
  return 'ok'
}

async function renumber(tripId: string): Promise<void> {
  const all = await db.destinations.where('tripId').equals(tripId).toArray()
  all.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.order - b.order)
  await Promise.all(
    all.map((d, i) => (d.order === i ? null : db.destinations.update(d.id, { order: i }))),
  )
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
  await db.places.add(place)
  return place.id
}

export async function updatePlace(
  id: string,
  patch: Partial<Omit<Place, 'id' | 'tripId'>>,
): Promise<void> {
  await db.places.update(id, patch)
}

export async function deletePlace(id: string): Promise<void> {
  await db.places.delete(id)
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
