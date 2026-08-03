import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { db, type Leg, type Place } from '../db/schema'
import {
  addActivity,
  addStop,
  ensureDays,
  removeItem,
  reorderItems,
  updateItem,
} from '../db/plannerRepo'
import { CATEGORIES } from '../lib/categories'
import { MODE_COLOR, MODE_EMOJI } from '../lib/directions'
import {
  buildSchedule,
  formatDistance,
  formatDuration,
  formatHHMM,
  type ScheduledItem,
} from '../lib/schedule'
import { destinationForDate, defaultBias } from '../lib/destinations'
import { useLegCompute } from '../lib/useLegCompute'
import { useTripSync } from '../lib/useTripSync'
import { LegDetail } from '../components/LegDetail'
import {
  DayRouteMap,
  type DayLegLine,
  type DayStopMarker,
} from '../components/DayRouteMap'

export function DayPlanner() {
  const { tripId = '' } = useParams()
  const trip = useLiveQuery(() => db.trips.get(tripId), [tripId])

  // Day 생성은 쓰기라서 liveQuery 안에서 하면 재실행 루프가 돈다. 효과로 분리하고,
  // 의존성은 원시값만 둔다 — trip 객체는 갱신마다 새 참조가 되어 효과가 계속 돈다.
  useTripSync(tripId)

  const tripStart = trip?.startDate
  const tripEnd = trip?.endDate
  useEffect(() => {
    if (!tripId || !tripStart || !tripEnd) return
    void ensureDays(tripId, tripStart, tripEnd)
  }, [tripId, tripStart, tripEnd])

  const days = useLiveQuery(
    () => db.days.where('tripId').equals(tripId).sortBy('date'),
    [tripId],
  )
  const places = useLiveQuery(
    () => db.places.where('tripId').equals(tripId).toArray(),
    [tripId],
  )
  const destinations = useLiveQuery(
    () => db.destinations.where('tripId').equals(tripId).toArray(),
    [tripId],
  )

  const [dayIdx, setDayIdx] = useState(0)
  const day = days?.[Math.min(dayIdx, (days?.length ?? 1) - 1)]

  const items = useLiveQuery(
    () => (day ? db.items.where('dayId').equals(day.id).sortBy('order') : []),
    [day?.id],
  )
  const legs = useLiveQuery(
    () => (day ? db.legs.where('dayId').equals(day.id).toArray() : []),
    [day?.id],
  )

  const { rows, totalTravelS } = useMemo(
    () => buildSchedule(items ?? [], legs ?? []),
    [items, legs],
  )

  /** 대중교통은 출발 시각에 따라 결과가 달라진다. 과거 시각은 구글이 거부하므로 뺀다. */
  const dayDate = day?.date
  const departAtByLegId = useMemo(() => {
    const map = new Map<string, Date>()
    if (!dayDate) return map
    const base = new Date(`${dayDate}T00:00:00`).getTime()
    rows.forEach((row, i) => {
      if (!row.incomingLeg || i === 0) return
      const at = base + rows[i - 1].endMin * 60_000
      if (at > Date.now()) map.set(row.incomingLeg.id, new Date(at))
    })
    return map
  }, [rows, dayDate])

  const { computing, failedLegIds, retry } = useLegCompute({
    legs: legs ?? [],
    items: items ?? [],
    places: places ?? [],
    departAtByLegId,
  })

  const placeById = useMemo(
    () => new Map((places ?? []).map((p) => [p.id, p])),
    [places],
  )

  /** 그날 머무는 도시. 지도 중심과 화면 표시에 쓴다 */
  const dayCity = dayDate
    ? destinationForDate(destinations ?? [], dayDate)
    : undefined
  const mapCenter = dayCity
    ? { lat: dayCity.lat, lng: dayCity.lng }
    : defaultBias(destinations ?? [])

  const [adding, setAdding] = useState<'place' | 'activity' | null>(null)
  const [openLegId, setOpenLegId] = useState<string | null>(null)
  const [selectedLegId, setSelectedLegId] = useState<string | null>(null)

  /** 지도에 찍을 정거장 — 활동은 위치가 없어 제외한다 */
  const stopMarkers = useMemo<DayStopMarker[]>(
    () =>
      rows
        .filter((r) => r.item.kind === 'stop')
        .map((r) => ({ itemId: r.item.id, place: placeById.get(r.item.placeId ?? '') }))
        .filter((s): s is DayStopMarker => Boolean(s.place)),
    [rows, placeById],
  )

  /** 지도에 그릴 구간선 — 계산이 끝난 것만 */
  const legLines = useMemo<DayLegLine[]>(
    () =>
      (legs ?? [])
        .map((leg) => {
          const opt = leg.alternatives.find((a) => a.mode === leg.selectedMode)
          return opt
            ? { legId: leg.id, mode: opt.mode, polyline: opt.polyline }
            : null
        })
        .filter((l): l is DayLegLine => l !== null),
    [legs],
  )

  /** 지도에 쓰이는 수단만 범례에 남긴다 */
  const usedModes = useMemo(
    () => [...new Set(legLines.map((l) => l.mode))],
    [legLines],
  )

  const sensors = useSensors(
    // 5px 넘게 끌어야 드래그로 인식 — 안 그러면 카드 안의 버튼이 안 눌린다
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  if (trip === undefined) {
    return <p className="p-5 text-sm text-slate-400">불러오는 중…</p>
  }
  if (trip === null) {
    return (
      <div className="p-5 text-sm">
        <p>여행을 찾을 수 없습니다.</p>
        <Link to="/" className="underline">
          목록으로
        </Link>
      </div>
    )
  }

  const openLeg = (legs ?? []).find((l) => l.id === openLegId)
  const openLegPlaces = openLeg
    ? {
        from: placeById.get(
          (items ?? []).find((i) => i.id === openLeg.fromItemId)?.placeId ?? '',
        ),
        to: placeById.get(
          (items ?? []).find((i) => i.id === openLeg.toItemId)?.placeId ?? '',
        ),
      }
    : null

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-5 pb-24">
      <header>
        <Link to={`/trip/${tripId}`} className="text-xs text-slate-400">
          ← 장소 서랍
        </Link>
        <h1 className="truncate text-xl font-semibold tracking-tight">
          {trip.title}
        </h1>
        {dayCity && (
          <p className="text-sm text-slate-500">📍 {dayCity.name}</p>
        )}
      </header>

      {/* 날짜 탭 */}
      <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5">
        {(days ?? []).map((d, i) => (
          <button
            key={d.id}
            type="button"
            onClick={() => setDayIdx(i)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs ${
              d.id === day?.id
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            Day {i + 1} · {d.date.slice(5).replace('-', '/')}
          </button>
        ))}
      </div>

      {stopMarkers.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
          <DayRouteMap
            stops={stopMarkers}
            lines={legLines}
            selectedLegId={selectedLegId}
            onSelectLeg={setSelectedLegId}
            center={mapCenter ?? { lat: 0, lng: 0 }}
          />
          {usedModes.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-900">
              {usedModes.map((m) => (
                <span key={m} className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-1 w-5 rounded-full"
                    style={{ background: MODE_COLOR[m] }}
                    aria-hidden
                  />
                  <span className="text-slate-500">{MODE_EMOJI[m]}</span>
                </span>
              ))}
              <span className="ml-auto text-slate-400">
                {selectedLegId ? '빈 곳을 눌러 해제' : '구간을 눌러 강조'}
              </span>
            </div>
          )}
        </div>
      )}

      {!day ? (
        <p className="py-8 text-center text-sm text-slate-400">
          날짜를 만드는 중…
        </p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">
          아직 일정이 없습니다. 아래에서 장소를 추가하세요.
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(e: DragEndEvent) => {
            const { active, over } = e
            if (!over || active.id === over.id || !items) return
            const ids = items.map((i) => i.id)
            const from = ids.indexOf(String(active.id))
            const to = ids.indexOf(String(over.id))
            if (from < 0 || to < 0) return
            void reorderItems(day.id, arrayMove(ids, from, to))
          }}
        >
          <SortableContext
            items={rows.map((r) => r.item.id)}
            strategy={verticalListSortingStrategy}
          >
            <ol className="flex flex-col">
              {rows.map((row) => (
                <Fragment key={row.item.id}>
                  {row.incomingLeg && (
                    <LegRow
                      leg={row.incomingLeg}
                      selected={selectedLegId === row.incomingLeg.id}
                      computing={computing === row.incomingLeg.id}
                      failed={Boolean(failedLegIds[row.incomingLeg.id])}
                      onRetry={() => retry(row.incomingLeg!.id)}
                      onSelect={() =>
                        setSelectedLegId((cur) =>
                          cur === row.incomingLeg!.id ? null : row.incomingLeg!.id,
                        )
                      }
                      onOpen={() => setOpenLegId(row.incomingLeg!.id)}
                    />
                  )}
                  <ItemCard row={row} place={placeById.get(row.item.placeId ?? '')} />
                </Fragment>
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}

      {rows.length > 0 && (
        <p className="text-center text-xs text-slate-400">
          ⏱ 총 이동 {formatDuration(totalTravelS)}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setAdding('place')}
          className="flex-1 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900"
        >
          + 장소
        </button>
        <button
          type="button"
          onClick={() => setAdding('activity')}
          className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm dark:border-slate-700"
        >
          + 활동
        </button>
      </div>

      {adding === 'place' && day && (
        <PlacePicker
          places={places ?? []}
          onClose={() => setAdding(null)}
          onPick={async (placeId) => {
            await addStop(day.id, placeId)
            setAdding(null)
          }}
        />
      )}

      {adding === 'activity' && day && (
        <ActivityForm
          onClose={() => setAdding(null)}
          onSubmit={async (title, min) => {
            await addActivity(day.id, title, min)
            setAdding(null)
          }}
        />
      )}

      {openLeg && openLegPlaces?.from && openLegPlaces.to && (
        <LegDetail
          leg={openLeg}
          from={openLegPlaces.from}
          to={openLegPlaces.to}
          departAt={departAtByLegId.get(openLeg.id)}
          onClose={() => setOpenLegId(null)}
        />
      )}
    </div>
  )
}

// ---------- 타임라인 카드 ----------

function ItemCard({ row, place }: { row: ScheduledItem; place?: Place }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.item.id })
  const [editing, setEditing] = useState(false)

  const isActivity = row.item.kind === 'activity'
  const cat = place ? CATEGORIES[place.category] : null

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-xl border bg-white p-3.5 dark:bg-slate-900 ${
        isDragging ? 'z-10 shadow-lg' : ''
      } ${
        isActivity
          ? 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50'
          : 'border-slate-200 dark:border-slate-800'
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="mt-0.5 cursor-grab touch-none text-slate-300 active:cursor-grabbing"
          aria-label="순서 변경"
        >
          ⠿
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span
              className={`text-sm tabular-nums ${
                row.pinned ? 'font-medium' : 'text-slate-400'
              }`}
              title={row.pinned ? '고정된 시각' : '앞 일정에서 계산된 시각'}
            >
              {formatHHMM(row.startMin)}
            </span>
            {row.overnight && (
              <span className="text-xs text-amber-500">다음날</span>
            )}
          </div>
          <p className="truncate font-medium">
            {cat && <span className="mr-1">{cat.emoji}</span>}
            {isActivity ? row.item.title : (place?.name ?? '(삭제된 장소)')}
          </p>
          <p className="text-xs text-slate-500">
            {row.item.durationMin}분
            {place?.note ? ` · ${place.note}` : ''}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="shrink-0 text-xs text-slate-400"
        >
          {editing ? '닫기' : '수정'}
        </button>
      </div>

      {editing && (
        <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">시각 고정</span>
            <input
              type="time"
              value={row.item.startAt ?? ''}
              onChange={(e) =>
                void updateItem(row.item.id, {
                  startAt: e.target.value || undefined,
                })
              }
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">머무는 시간(분)</span>
            <input
              type="number"
              min={0}
              step={10}
              value={row.item.durationMin}
              onChange={(e) =>
                void updateItem(row.item.id, {
                  durationMin: Math.max(0, Number(e.target.value) || 0),
                })
              }
              className="w-24 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </label>
          <button
            type="button"
            onClick={() => void removeItem(row.item.id)}
            className="ml-auto text-xs text-rose-500"
          >
            일정에서 제거
          </button>
        </div>
      )}
    </li>
  )
}

function LegRow({
  leg,
  selected,
  computing,
  failed,
  onRetry,
  onSelect,
  onOpen,
}: {
  leg: Leg
  selected: boolean
  computing: boolean
  failed: boolean
  onRetry: () => void
  onSelect: () => void
  onOpen: () => void
}) {
  const opt = leg.alternatives.find((a) => a.mode === leg.selectedMode)

  return (
    <li className="flex items-center gap-2 py-2 pl-9 text-xs">
      <span className="text-slate-300">↓</span>
      {opt ? (
        <>
          {/* 누르면 지도에서 이 구간만 강조된다 */}
          <button
            type="button"
            onClick={onSelect}
            aria-pressed={selected}
            className="flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 dark:bg-slate-800"
            // 선택 표시는 수단 색과 맞춘다 — 지도의 강조된 선과 같은 색이라 눈이 바로 잇는다
            style={
              selected
                ? { boxShadow: `inset 0 0 0 2px ${MODE_COLOR[opt.mode]}` }
                : undefined
            }
          >
            <span
              className="inline-block h-1 w-4 rounded-full"
              style={{ background: MODE_COLOR[opt.mode] }}
              aria-hidden
            />
            <span>{MODE_EMOJI[opt.mode]}</span>
            <span className="font-medium">{formatDuration(opt.durationS)}</span>
            <span className="text-slate-500">{formatDistance(opt.distanceM)}</span>
            {opt.fareText && (
              <span className="text-emerald-600 dark:text-emerald-400">
                {opt.fareText}
              </span>
            )}
            {leg.alternatives.length > 1 && (
              <span className="text-slate-400">⇄{leg.alternatives.length}</span>
            )}
          </button>
          <button
            type="button"
            onClick={onOpen}
            className="text-slate-400 underline underline-offset-2"
          >
            상세
          </button>
        </>
      ) : computing ? (
        <span className="text-slate-400">경로 계산 중…</span>
      ) : failed ? (
        <span className="flex items-center gap-2 text-slate-400">
          경로를 찾지 못했습니다
          <button type="button" onClick={onRetry} className="underline">
            다시 시도
          </button>
        </span>
      ) : (
        <span className="text-slate-400">대기 중…</span>
      )}
    </li>
  )
}

// ---------- 추가 시트 ----------

function PlacePicker({
  places,
  onPick,
  onClose,
}: {
  places: Place[]
  onPick: (placeId: string) => void | Promise<void>
  onClose: () => void
}) {
  return (
    <Sheet title="장소 추가" onClose={onClose}>
      {places.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">
          장소 서랍이 비어 있습니다. 먼저 장소를 등록하세요.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {places.map((p) => {
            const cat = CATEGORIES[p.category]
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => void onPick(p.id)}
                  className="flex w-full items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2.5 text-left text-sm dark:border-slate-800"
                >
                  <span>{cat.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{p.name}</span>
                    {p.note && (
                      <span className="block truncate text-xs text-slate-500">
                        {p.note}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Sheet>
  )
}

const ACTIVITY_PRESETS: [string, number][] = [
  ['입국 심사 및 짐 찾기', 80],
  ['호텔 체크인', 30],
  ['식사', 90],
  ['휴식', 60],
]

function ActivityForm({
  onSubmit,
  onClose,
}: {
  onSubmit: (title: string, durationMin: number) => void | Promise<void>
  onClose: () => void
}) {
  const [title, setTitle] = useState('')
  const [min, setMin] = useState(60)

  return (
    <Sheet title="활동 추가" onClose={onClose}>
      <p className="mb-3 text-xs text-slate-500">
        이동이 없는 항목입니다. 시간만 차지하고 경로는 계산하지 않습니다.
      </p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {ACTIVITY_PRESETS.map(([t, d]) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTitle(t)
              setMin(d)
            }}
            className="rounded-full bg-slate-100 px-2.5 py-1 text-xs dark:bg-slate-800"
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2.5">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="활동 이름"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
        <label className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">소요 시간</span>
          <input
            type="number"
            min={0}
            step={10}
            value={min}
            onChange={(e) => setMin(Math.max(0, Number(e.target.value) || 0))}
            className="w-24 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <span className="text-slate-500">분</span>
        </label>
        <button
          type="button"
          disabled={!title.trim()}
          onClick={() => void onSubmit(title.trim(), min)}
          className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
        >
          추가
        </button>
      </div>
    </Sheet>
  )
}

function Sheet({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/40">
      <div className="max-h-[80vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 dark:bg-slate-950">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium">{title}</h2>
          <button type="button" onClick={onClose} className="text-sm text-slate-500">
            닫기
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
