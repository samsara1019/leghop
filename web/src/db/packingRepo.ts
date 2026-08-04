import { db, newId, type PackingItem } from './schema'
import {
  assertWritable,
  deletePackingItemsRemote,
  upsertPackingItems,
} from './remote'
import {
  buildContext,
  generateItems,
  type PackingContext,
} from '../lib/packing'

/** 서버 먼저, 성공하면 로컬 미러 (repo.ts와 같은 규칙) */

export async function togglePackingItem(id: string): Promise<void> {
  assertWritable()
  const cur = await db.packingItems.get(id)
  if (!cur) return
  const next = { ...cur, checked: !cur.checked }
  await upsertPackingItems(cur.tripId, [next])
  await db.packingItems.put(next)
}

export async function addCustomPackingItem(
  tripId: string,
  category: string,
  name: string,
  note?: string,
): Promise<'ok' | 'duplicate'> {
  const trimmed = name.trim()
  if (!trimmed) return 'ok'

  // 서버에 (trip_id, name) 유니크 인덱스가 있다. 미리 걸러서
  // 사용자에게 "이미 있습니다"로 알려주는 편이 낫다.
  const dup = await db.packingItems
    .where('tripId')
    .equals(tripId)
    .filter((p) => p.name === trimmed)
    .first()
  if (dup) return 'duplicate'

  assertWritable()
  const last = await db.packingItems.where('tripId').equals(tripId).toArray()
  const item: PackingItem = {
    id: newId(),
    tripId,
    category,
    name: trimmed,
    note: note?.trim() || undefined,
    checked: false,
    order: last.reduce((m, p) => Math.max(m, p.order), -1) + 1,
    source: 'custom',
  }
  await upsertPackingItems(tripId, [item])
  await db.packingItems.add(item)
  return 'ok'
}

export async function deletePackingItem(id: string): Promise<void> {
  assertWritable()
  await deletePackingItemsRemote([id])
  await db.packingItems.delete(id)
}

export interface GenerateResult {
  added: number
  removed: number
  kept: number
  context: PackingContext
}

/**
 * 템플릿을 적용한다.
 *
 * 규칙:
 * - 사용자가 직접 추가한 항목(source='custom')은 절대 건드리지 않는다
 * - 이미 있는 템플릿 항목은 **체크 상태를 유지**한다. 재생성이 진행 상황을
 *   날려버리면 아무도 두 번 누르지 않는다
 * - 조건이 안 맞아 빠진 템플릿 항목은, **체크되지 않은 것만** 지운다.
 *   체크했다는 건 실제로 챙겼다는 뜻이라 남겨두는 게 맞다
 */
export async function applyTemplate(tripId: string): Promise<GenerateResult> {
  const trip = await db.trips.get(tripId)
  if (!trip) throw new Error('trip_not_found')
  const destinations = await db.destinations.where('tripId').equals(tripId).toArray()

  const ctx = buildContext(destinations, trip.startDate, trip.endDate)
  const wanted = generateItems(ctx)
  const wantedByName = new Map(wanted.map((w) => [w.name, w]))

  const existing = await db.packingItems.where('tripId').equals(tripId).toArray()
  const existingByName = new Map(existing.map((p) => [p.name, p]))

  const toUpsert: PackingItem[] = []
  for (const w of wanted) {
    const prev = existingByName.get(w.name)
    toUpsert.push({
      id: prev?.id ?? newId(),
      tripId,
      category: w.category,
      name: w.name,
      note: w.note,
      // 체크 상태는 보존한다
      checked: prev?.checked ?? false,
      order: w.order,
      source: prev?.source === 'custom' ? 'custom' : 'template',
    })
  }

  const stale = existing.filter(
    (p) => p.source === 'template' && !wantedByName.has(p.name) && !p.checked,
  )

  assertWritable()
  if (toUpsert.length) await upsertPackingItems(tripId, toUpsert)
  if (stale.length) await deletePackingItemsRemote(stale.map((p) => p.id))

  await db.transaction('rw', db.packingItems, async () => {
    if (stale.length) await db.packingItems.bulkDelete(stale.map((p) => p.id))
    await db.packingItems.bulkPut(toUpsert)
  })

  const added = toUpsert.filter((p) => !existingByName.has(p.name)).length
  return {
    added,
    removed: stale.length,
    kept: toUpsert.length - added,
    context: ctx,
  }
}

export async function resetChecks(tripId: string): Promise<void> {
  assertWritable()
  const all = await db.packingItems.where('tripId').equals(tripId).toArray()
  const next = all.filter((p) => p.checked).map((p) => ({ ...p, checked: false }))
  if (next.length === 0) return
  await upsertPackingItems(tripId, next)
  await db.packingItems.bulkPut(next)
}
