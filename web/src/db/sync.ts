import { db } from './schema'
import {
  fetchTripSnapshot,
  fetchTrips,
  upsertDays,
  upsertDestination,
  upsertItems,
  upsertLegs,
  upsertPlace,
  upsertTrip,
} from './remote'

/**
 * 서버 → IndexedDB 미러링.
 *
 * IndexedDB는 **읽기 전용 사본**이다. 정본은 서버고, 여기 담기는 건
 * 네트워크가 없을 때 일정·경로를 꺼내 보기 위한 스냅샷이다 (DESIGN.md §5).
 * 그래서 병합이 아니라 **통째로 갈아끼운다** — 병합하면 서버에서 지워진 항목이
 * 로컬에 영원히 남고, 그걸 정리하려면 결국 충돌 해결 로직이 필요해진다.
 */

export async function mirrorTripList(): Promise<void> {
  const { trips, destinations } = await fetchTrips()
  const ids = new Set(trips.map((t) => t.id))

  await db.transaction('rw', [db.trips, db.destinations], async () => {
    // 서버에서 사라진 여행(공유 해제·삭제)은 로컬에서도 지운다
    const localIds = await db.trips.toCollection().primaryKeys()
    const gone = localIds.filter((id) => !ids.has(id))
    if (gone.length) {
      await db.trips.bulkDelete(gone)
      await db.destinations.where('tripId').anyOf(gone).delete()
    }
    await db.trips.bulkPut(trips)
    for (const tripId of ids) {
      await db.destinations.where('tripId').equals(tripId).delete()
    }
    await db.destinations.bulkPut(destinations)
  })
}

/** 여행 하나를 통째로 다시 받아 미러를 교체한다 */
export async function mirrorTrip(tripId: string): Promise<boolean> {
  const snap = await fetchTripSnapshot(tripId)

  if (!snap) {
    // 더는 볼 수 없는 여행 — 로컬에서도 치운다
    await purgeTrip(tripId)
    return false
  }

  await db.transaction(
    'rw',
    [db.trips, db.destinations, db.places, db.days, db.items, db.legs],
    async () => {
      const dayIds = await db.days.where('tripId').equals(tripId).primaryKeys()
      if (dayIds.length) {
        await db.items.where('dayId').anyOf(dayIds).delete()
        await db.legs.where('dayId').anyOf(dayIds).delete()
      }
      await db.days.where('tripId').equals(tripId).delete()
      await db.places.where('tripId').equals(tripId).delete()
      await db.destinations.where('tripId').equals(tripId).delete()

      await db.trips.put(snap.trip)
      await db.destinations.bulkPut(snap.destinations)
      await db.places.bulkPut(snap.places)
      await db.days.bulkPut(snap.days)
      await db.items.bulkPut(snap.items)
      await db.legs.bulkPut(snap.legs)
    },
  )
  return true
}

export async function purgeTrip(tripId: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.trips, db.destinations, db.places, db.days, db.items, db.legs],
    async () => {
      const dayIds = await db.days.where('tripId').equals(tripId).primaryKeys()
      if (dayIds.length) {
        await db.items.where('dayId').anyOf(dayIds).delete()
        await db.legs.where('dayId').anyOf(dayIds).delete()
        await db.days.bulkDelete(dayIds)
      }
      await db.places.where('tripId').equals(tripId).delete()
      await db.destinations.where('tripId').equals(tripId).delete()
      await db.trips.delete(tripId)
    },
  )
}

// ---------------------------------------------------------------------------
// Supabase 도입 전에 로컬에만 있던 여행 구제
//
// mirrorTripList()는 서버에 없는 로컬 여행을 지운다. 그대로 두면 계정을 붙이는
// 순간 그전에 만든 여행이 조용히 사라진다. 그래서 목록을 미러링하기 **전에**
// 로컬 전용 여행이 있는지 확인하고, 사용자에게 올릴지 물어본다.
// ---------------------------------------------------------------------------

export async function findLocalOnlyTrips(): Promise<
  { id: string; title: string }[]
> {
  const { trips: remote } = await fetchTrips()
  const remoteIds = new Set(remote.map((t) => t.id))
  const local = await db.trips.toArray()
  return local
    .filter((t) => !remoteIds.has(t.id))
    .map((t) => ({ id: t.id, title: t.title }))
}

/** 로컬 여행을 내 소유로 서버에 올린다. FK 때문에 순서가 중요하다. */
export async function uploadLocalTrip(
  tripId: string,
  ownerId: string,
): Promise<void> {
  const trip = await db.trips.get(tripId)
  if (!trip) return

  const [destinations, places, days] = await Promise.all([
    db.destinations.where('tripId').equals(tripId).toArray(),
    db.places.where('tripId').equals(tripId).toArray(),
    db.days.where('tripId').equals(tripId).toArray(),
  ])
  const dayIds = days.map((d) => d.id)
  const [items, legs] = await Promise.all([
    dayIds.length ? db.items.where('dayId').anyOf(dayIds).toArray() : [],
    dayIds.length ? db.legs.where('dayId').anyOf(dayIds).toArray() : [],
  ])

  // trips → destinations → places → days → items → legs
  await upsertTrip(trip, ownerId)
  for (const d of destinations) await upsertDestination(d)
  for (const p of places) await upsertPlace(p)
  await upsertDays(tripId, days)
  await upsertItems(tripId, items)
  await upsertLegs(tripId, legs)
}

export async function uploadLocalTrips(
  tripIds: string[],
  ownerId: string,
): Promise<{ uploaded: number; failed: { id: string; error: string }[] }> {
  let uploaded = 0
  const failed: { id: string; error: string }[] = []
  for (const id of tripIds) {
    try {
      await uploadLocalTrip(id, ownerId)
      uploaded++
    } catch (err) {
      failed.push({ id, error: err instanceof Error ? err.message : String(err) })
    }
  }
  return { uploaded, failed }
}

/** 로그아웃 시 남의 데이터가 이 기기에 남지 않게 비운다 */
export async function clearMirror(): Promise<void> {
  await db.transaction(
    'rw',
    [db.trips, db.destinations, db.places, db.days, db.items, db.legs],
    async () => {
      await Promise.all([
        db.legs.clear(),
        db.items.clear(),
        db.days.clear(),
        db.places.clear(),
        db.destinations.clear(),
        db.trips.clear(),
      ])
    },
  )
}
