import { db, newId, type Place, type PlaceCategory, type Trip } from './schema'

// ---------- Trip ----------

export interface NewTripInput {
  title: string
  city: string
  lat: number
  lng: number
  startDate: string
  endDate: string
}

export async function createTrip(input: NewTripInput): Promise<string> {
  const now = Date.now()
  const trip: Trip = { id: newId(), ...input, createdAt: now, updatedAt: now }
  await db.trips.add(trip)
  return trip.id
}

/** 여행을 지우면 딸린 것도 전부 지운다. 고아 레코드가 남으면 용량만 먹는다. */
export async function deleteTrip(tripId: string): Promise<void> {
  await db.transaction('rw', db.trips, db.places, db.days, db.items, db.legs, async () => {
    const dayIds = await db.days.where('tripId').equals(tripId).primaryKeys()
    if (dayIds.length) {
      const itemIds = await db.items.where('dayId').anyOf(dayIds).primaryKeys()
      await db.legs.where('dayId').anyOf(dayIds).delete()
      await db.items.bulkDelete(itemIds)
      await db.days.bulkDelete(dayIds)
    }
    await db.places.where('tripId').equals(tripId).delete()
    await db.trips.delete(tripId)
  })
}

// ---------- Place ----------

export interface NewPlaceInput {
  tripId: string
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
