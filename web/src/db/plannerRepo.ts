import {
  db,
  newId,
  type Day,
  type Item,
  type Leg,
  type LegOption,
  type TravelMode,
} from './schema'
import { eachDateISO } from '../lib/dates'
import {
  assertWritable,
  deleteDaysRemote,
  deleteItemsRemote,
  deleteLegsRemote,
  upsertDays,
  upsertItems,
  upsertLegs,
} from './remote'

/**
 * 서버 먼저, 성공하면 로컬 미러 (repo.ts와 같은 규칙).
 *
 * items/legs는 로컬에서 dayId만 들고 있지만 서버 테이블에는 trip_id가
 * 비정규화돼 있다 — RLS가 조인 없이 권한을 판정하기 위해서다.
 * 그래서 쓰기 전에 dayId로 tripId를 찾아 붙인다.
 */

async function tripIdOfDay(dayId: string): Promise<string> {
  const day = await db.days.get(dayId)
  if (!day) throw new Error(`day_not_found: ${dayId}`)
  return day.tripId
}

// ---------- Day ----------

/**
 * 여행 기간에 맞춰 Day를 만든다. 이미 있는 날짜는 건드리지 않는다.
 *
 * Trip 객체 대신 원시값을 받는다 — 호출부가 useEffect 의존성에 객체를 넣으면
 * liveQuery가 새 객체를 낼 때마다 효과가 다시 돌아 쓰기 루프가 생긴다.
 */
export async function ensureDays(
  tripId: string,
  startDate: string,
  endDate: string,
): Promise<Day[]> {
  const dates = eachDateISO(startDate, endDate)
  const existing = await db.days.where('tripId').equals(tripId).toArray()
  const byDate = new Map(existing.map((d) => [d.date, d]))

  const missing: Day[] = dates
    .filter((date) => !byDate.has(date))
    .map((date, i) => ({ id: newId(), tripId, date, order: i }))

  // 기간이 줄었으면 범위를 벗어난 **빈** 날짜만 정리한다
  const orphans: Day[] = []
  for (const d of existing) {
    if (dates.includes(d.date)) continue
    const count = await db.items.where('dayId').equals(d.id).count()
    if (count === 0) orphans.push(d)
  }

  const kept = [...existing.filter((d) => !orphans.includes(d)), ...missing]
  kept.sort((a, b) => a.date.localeCompare(b.date))
  const renumbered = kept.map((d, i) => ({ ...d, order: i }))

  const changed = renumbered.filter((d) => {
    const before = byDate.get(d.date)
    return !before || before.order !== d.order
  })

  if (changed.length === 0 && orphans.length === 0) return renumbered

  assertWritable()
  if (changed.length) await upsertDays(tripId, changed)
  if (orphans.length) await deleteDaysRemote(orphans.map((d) => d.id))

  await db.transaction('rw', db.days, async () => {
    if (orphans.length) await db.days.bulkDelete(orphans.map((d) => d.id))
    await db.days.bulkPut(renumbered)
  })
  return renumbered
}

// ---------- Item ----------

async function nextOrder(dayId: string): Promise<number> {
  const last = await db.items.where('dayId').equals(dayId).reverse().sortBy('order')
  return (last[0]?.order ?? -1) + 1
}

export async function addStop(
  dayId: string,
  placeId: string,
  durationMin = 60,
): Promise<string> {
  assertWritable()
  const tripId = await tripIdOfDay(dayId)
  const item: Item = {
    id: newId(),
    dayId,
    order: await nextOrder(dayId),
    kind: 'stop',
    placeId,
    durationMin,
  }
  await upsertItems(tripId, [item])
  await db.items.add(item)
  await reconcileLegs(dayId)
  return item.id
}

export async function addActivity(
  dayId: string,
  title: string,
  durationMin: number,
): Promise<string> {
  assertWritable()
  const tripId = await tripIdOfDay(dayId)
  const item: Item = {
    id: newId(),
    dayId,
    order: await nextOrder(dayId),
    kind: 'activity',
    title,
    durationMin,
  }
  await upsertItems(tripId, [item])
  await db.items.add(item)
  // 활동은 위치가 없어 Leg 구성에 영향을 주지 않지만,
  // 앞뒤가 붙는 순서가 바뀔 수 있어 한 번 맞춰준다.
  await reconcileLegs(dayId)
  return item.id
}

export async function removeItem(itemId: string): Promise<void> {
  const item = await db.items.get(itemId)
  if (!item) return
  assertWritable()
  await deleteItemsRemote([itemId])
  await db.items.delete(itemId)
  await reconcileLegs(item.dayId)
}

export async function updateItem(
  itemId: string,
  patch: Partial<Pick<Item, 'startAt' | 'durationMin' | 'title' | 'note'>>,
): Promise<void> {
  assertWritable()
  const cur = await db.items.get(itemId)
  if (!cur) return
  const next = { ...cur, ...patch }
  await upsertItems(await tripIdOfDay(cur.dayId), [next])
  await db.items.put(next)
}

/** 드래그로 순서가 바뀐 뒤 호출. orderedIds는 화면에 보이는 순서 그대로. */
export async function reorderItems(
  dayId: string,
  orderedIds: string[],
): Promise<void> {
  assertWritable()
  const tripId = await tripIdOfDay(dayId)
  const current = await db.items.where('dayId').equals(dayId).toArray()
  const byId = new Map(current.map((i) => [i.id, i]))

  const next = orderedIds
    .map((id, order) => {
      const item = byId.get(id)
      return item ? { ...item, order } : null
    })
    .filter((i): i is Item => i !== null)

  await upsertItems(tripId, next)
  await db.items.bulkPut(next)
  await reconcileLegs(dayId)
}

// ---------- Leg ----------

/**
 * 타임라인의 '정거장'들을 인접 쌍으로 묶어 Leg 집합을 실제 순서에 맞춘다.
 * 활동(kind='activity')은 위치가 없으므로 건너뛴다 — 공항→(입국심사)→숙소는
 * 공항→숙소 한 구간이다.
 *
 * 이미 있고 쌍이 그대로인 Leg는 보존한다. 그래야 순서를 조금 바꿨을 때
 * 영향받은 구간만 다시 계산된다 (DESIGN.md §4 재계산 트리거).
 */
export async function reconcileLegs(dayId: string): Promise<void> {
  const tripId = await tripIdOfDay(dayId)
  const items = await db.items.where('dayId').equals(dayId).sortBy('order')
  const stops = items.filter((i) => i.kind === 'stop')

  const desired: [string, string][] = []
  for (let i = 0; i < stops.length - 1; i++) {
    desired.push([stops[i].id, stops[i + 1].id])
  }
  const desiredKeys = new Set(desired.map(([a, b]) => `${a}>${b}`))

  const existing = await db.legs.where('dayId').equals(dayId).toArray()
  const existingKeys = new Set(existing.map((l) => `${l.fromItemId}>${l.toItemId}`))

  const stale = existing.filter(
    (l) => !desiredKeys.has(`${l.fromItemId}>${l.toItemId}`),
  )
  const fresh: Leg[] = desired
    .filter(([a, b]) => !existingKeys.has(`${a}>${b}`))
    .map(([fromItemId, toItemId]) => ({
      id: newId(),
      dayId,
      fromItemId,
      toItemId,
      selectedMode: 'transit' as TravelMode,
      alternatives: [],
      // 0이면 "아직 계산 안 됨"
      computedAt: 0,
    }))

  if (stale.length === 0 && fresh.length === 0) return

  assertWritable()
  if (stale.length) await deleteLegsRemote(stale.map((l) => l.id))
  if (fresh.length) await upsertLegs(tripId, fresh)

  await db.transaction('rw', db.legs, async () => {
    if (stale.length) await db.legs.bulkDelete(stale.map((l) => l.id))
    if (fresh.length) await db.legs.bulkAdd(fresh)
  })
}

/** 계산된 수단을 Leg에 저장한다. 같은 수단이 이미 있으면 갈아끼운다. */
export async function saveLegOption(
  legId: string,
  option: LegOption,
  select: boolean,
): Promise<void> {
  const leg = await db.legs.get(legId)
  if (!leg) return
  assertWritable()
  const next: Leg = {
    ...leg,
    alternatives: [
      ...leg.alternatives.filter((a) => a.mode !== option.mode),
      option,
    ],
    computedAt: Date.now(),
    staleReason: undefined,
    ...(select ? { selectedMode: option.mode } : {}),
  }
  await upsertLegs(await tripIdOfDay(leg.dayId), [next])
  await db.legs.put(next)
}

/** 경로를 못 찾았을 때도 재시도 폭주를 막으려면 시각을 남겨야 한다. */
export async function markLegComputed(legId: string): Promise<void> {
  const leg = await db.legs.get(legId)
  if (!leg) return
  assertWritable()
  const next = { ...leg, computedAt: Date.now() }
  await upsertLegs(await tripIdOfDay(leg.dayId), [next])
  await db.legs.put(next)
}

export async function selectLegMode(
  legId: string,
  mode: TravelMode,
): Promise<void> {
  const leg = await db.legs.get(legId)
  if (!leg) return
  assertWritable()
  const next = { ...leg, selectedMode: mode }
  await upsertLegs(await tripIdOfDay(leg.dayId), [next])
  await db.legs.put(next)
}

/**
 * 두 정거장 사이 구간의 수단을 지정한다.
 * 붙여넣기 가져오기에서 "공항버스로 이동" 같은 힌트를 반영할 때 쓴다 —
 * 그 시점에는 Leg id를 모르고 앞뒤 Item만 알기 때문이다.
 */
export async function setLegModeByItems(
  dayId: string,
  fromItemId: string,
  toItemId: string,
  mode: TravelMode,
): Promise<void> {
  const leg = await db.legs
    .where('dayId')
    .equals(dayId)
    .filter((l) => l.fromItemId === fromItemId && l.toItemId === toItemId)
    .first()
  if (leg) await selectLegMode(leg.id, mode)
}
