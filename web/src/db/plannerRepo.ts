import {
  db,
  newId,
  type Day,
  type Item,
  type Leg,
  type LegOption,
  type TravelMode,
} from './schema'

// ---------- Day ----------

function eachDate(startDate: string, endDate: string): string[] {
  const out: string[] = []
  const cur = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T00:00:00`)
  // 날짜가 뒤집혀 있으면 하루만 만든다
  if (Number.isNaN(cur.getTime()) || Number.isNaN(end.getTime()) || cur > end) {
    return [startDate]
  }
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10))
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

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
  const dates = eachDate(startDate, endDate)
  await db.transaction('rw', db.days, async () => {
    const existing = await db.days.where('tripId').equals(tripId).toArray()
    const byDate = new Map(existing.map((d) => [d.date, d]))

    // order는 아래에서 날짜순으로 다시 매기므로 여기서는 임시값이다
    const missing: Day[] = dates
      .filter((date) => !byDate.has(date))
      .map((date) => ({
        id: newId(),
        tripId,
        date,
        order: dates.indexOf(date),
      }))
    if (missing.length) await db.days.bulkAdd(missing)

    // 기간이 줄었으면 범위를 벗어난 빈 날짜는 정리한다
    const orphan = existing.filter((d) => !dates.includes(d.date))
    for (const d of orphan) {
      const count = await db.items.where('dayId').equals(d.id).count()
      if (count === 0) await db.days.delete(d.id)
    }

    // order를 날짜순으로 다시 매긴다
    const all = await db.days.where('tripId').equals(tripId).toArray()
    all.sort((a, b) => a.date.localeCompare(b.date))
    await Promise.all(
      all.map((d, i) => (d.order === i ? null : db.days.update(d.id, { order: i }))),
    )
  })

  const result = await db.days.where('tripId').equals(tripId).toArray()
  return result.sort((a, b) => a.date.localeCompare(b.date))
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
  const item: Item = {
    id: newId(),
    dayId,
    order: await nextOrder(dayId),
    kind: 'stop',
    placeId,
    durationMin,
  }
  await db.items.add(item)
  await reconcileLegs(dayId)
  return item.id
}

export async function addActivity(
  dayId: string,
  title: string,
  durationMin: number,
): Promise<string> {
  const item: Item = {
    id: newId(),
    dayId,
    order: await nextOrder(dayId),
    kind: 'activity',
    title,
    durationMin,
  }
  await db.items.add(item)
  // 활동은 위치가 없어 Leg 구성에 영향을 주지 않지만,
  // 앞뒤가 붙는 순서가 바뀔 수 있어 한 번 맞춰준다.
  await reconcileLegs(dayId)
  return item.id
}

export async function removeItem(itemId: string): Promise<void> {
  const item = await db.items.get(itemId)
  if (!item) return
  await db.items.delete(itemId)
  await reconcileLegs(item.dayId)
}

export async function updateItem(
  itemId: string,
  patch: Partial<Pick<Item, 'startAt' | 'durationMin' | 'title' | 'note'>>,
): Promise<void> {
  await db.items.update(itemId, patch)
}

/** 드래그로 순서가 바뀐 뒤 호출. orderedIds는 화면에 보이는 순서 그대로. */
export async function reorderItems(
  dayId: string,
  orderedIds: string[],
): Promise<void> {
  await db.transaction('rw', db.items, async () => {
    await Promise.all(
      orderedIds.map((id, i) => db.items.update(id, { order: i })),
    )
  })
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
  await db.transaction('rw', db.items, db.legs, async () => {
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
    if (stale.length) await db.legs.bulkDelete(stale.map((l) => l.id))

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
  const alternatives = [
    ...leg.alternatives.filter((a) => a.mode !== option.mode),
    option,
  ]
  await db.legs.update(legId, {
    alternatives,
    computedAt: Date.now(),
    staleReason: undefined,
    ...(select ? { selectedMode: option.mode } : {}),
  })
}

/** 경로를 못 찾았을 때도 재시도 폭주를 막으려면 시각을 남겨야 한다. */
export async function markLegComputed(legId: string): Promise<void> {
  await db.legs.update(legId, { computedAt: Date.now() })
}

export async function selectLegMode(
  legId: string,
  mode: TravelMode,
): Promise<void> {
  await db.legs.update(legId, { selectedMode: mode })
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
  if (leg) await db.legs.update(leg.id, { selectedMode: mode })
}
