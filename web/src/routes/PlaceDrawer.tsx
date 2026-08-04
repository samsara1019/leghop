import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Place, type PlaceCategory } from '../db/schema'
import { addPlace, deletePlace, findPlaceByGoogleId, updatePlace } from '../db/repo'
import { CATEGORIES, CATEGORY_ORDER, inferCategory } from '../lib/categories'
import { PlaceSearch } from '../components/PlaceSearch'
import { PlacesMap } from '../components/PlacesMap'
import { Chip } from '../components/Chip'
import {
  defaultBias,
  destinationForPlace,
  sortDestinations,
} from '../lib/destinations'
import { useTripSync } from '../lib/useTripSync'

type Filter = PlaceCategory | 'all'

export function PlaceDrawer() {
  const { tripId = '' } = useParams()
  const trip = useLiveQuery(() => db.trips.get(tripId), [tripId])
  const places = useLiveQuery(
    () => db.places.where('tripId').equals(tripId).toArray(),
    [tripId],
  )
  const destinations = useLiveQuery(
    () => db.destinations.where('tripId').equals(tripId).toArray(),
    [tripId],
  )

  // 화면을 열 때·창으로 돌아올 때 서버에서 다시 받는다
  useTripSync(tripId)

  const [filter, setFilter] = useState<Filter>('all')
  /** 어느 도시 기준으로 검색·등록할지. null이면 전체 보기 */
  const [destId, setDestId] = useState<string | null>(null)
  const [pickMode, setPickMode] = useState(false)
  const [pending, setPending] = useState<{ lat: number; lng: number } | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  if (trip === undefined) {
    return <p className="p-5 text-sm text-slate-400">불러오는 중…</p>
  }
  if (trip === null) {
    return (
      <div className="p-5">
        <p className="text-sm">여행을 찾을 수 없습니다.</p>
        <Link to="/" className="text-sm underline">
          목록으로
        </Link>
      </div>
    )
  }

  const cities = sortDestinations(destinations ?? [])
  const activeDest = destId ? cities.find((d) => d.id === destId) : undefined
  // 도시를 고르지 않았으면 첫 도시를 편향 기준으로 쓴다
  const bias = activeDest
    ? { lat: activeDest.lat, lng: activeDest.lng }
    : defaultBias(cities)

  const all = places ?? []
  const inCity = activeDest
    ? all.filter((p) => p.destinationId === activeDest.id)
    : all
  const visible =
    filter === 'all' ? inCity : inCity.filter((p) => p.category === filter)
  const counts = inCity.reduce<Record<string, number>>((acc, p) => {
    acc[p.category] = (acc[p.category] ?? 0) + 1
    return acc
  }, {})
  const cityCounts = new Map<string, number>()
  for (const p of all) {
    if (!p.destinationId) continue
    cityCounts.set(p.destinationId, (cityCounts.get(p.destinationId) ?? 0) + 1)
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-5">
      <header className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <Link to="/" className="text-xs text-slate-400">
            ← 여행 목록
          </Link>
          <h1 className="truncate text-xl font-semibold tracking-tight">
            {trip.title}
          </h1>
          <p className="truncate text-sm text-slate-500">
            {cities.map((c) => c.name).join(' → ') || '도시 없음'} · 장소 {all.length}개
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            to={`/trip/${tripId}/packing`}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700"
          >
            준비물
          </Link>
          <Link
            to={`/trip/${tripId}/share`}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700"
          >
            공유
          </Link>
          <Link
            to={`/trip/${tripId}/plan`}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900"
          >
            일정 짜기 →
          </Link>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip active={destId === null} onClick={() => setDestId(null)}>
          전체
        </Chip>
        {cities.map((c) => (
          <Chip key={c.id} active={destId === c.id} onClick={() => setDestId(c.id)}>
            {c.name}
            {cityCounts.get(c.id) ? ` ${cityCounts.get(c.id)}` : ''}
          </Chip>
        ))}
        <Link
          to={`/trip/${tripId}/cities`}
          className="ml-auto text-xs text-slate-400 underline underline-offset-2"
        >
          도시 관리
        </Link>
      </div>

      <PlaceSearch
        key={activeDest?.id ?? 'all'}
        bias={bias}
        placeholder={
          activeDest
            ? `${activeDest.name}에서 장소 검색`
            : '장소 검색 (숙소, 맛집, 관광지…)'
        }
        onSelect={async (p) => {
          const dup = p.googlePlaceId
            ? await findPlaceByGoogleId(tripId, p.googlePlaceId)
            : undefined
          if (dup) {
            setNotice(`이미 등록된 장소입니다: ${dup.name}`)
            return
          }
          const id = await addPlace({
            tripId,
            destinationId: destinationForPlace(cities, activeDest, p),
            googlePlaceId: p.googlePlaceId,
            name: p.name,
            category: inferCategory(p.types),
            lat: p.lat,
            lng: p.lng,
            address: p.address,
            openingHours: p.openingHours,
            priceLevel: p.priceLevel,
          })
          setSelectedId(id)
          setNotice(null)
        }}
      />

      {notice && (
        <p className="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {notice}
        </p>
      )}

      <Link
        to={`/trip/${tripId}/import`}
        className="rounded-lg border border-dashed border-slate-300 px-4 py-2.5 text-center text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300"
      >
        📋 엑셀·메모 붙여넣기로 한번에 추가
      </Link>

      <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
        <PlacesMap
          center={bias ?? { lat: 0, lng: 0 }}
          places={inCity}
          pickMode={pickMode}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onPick={(pos) => {
            setPending(pos)
            setPickMode(false)
          }}
        />
        <button
          type="button"
          onClick={() => setPickMode((v) => !v)}
          className="w-full border-t border-slate-200 bg-white py-2.5 text-sm dark:border-slate-800 dark:bg-slate-900"
        >
          {pickMode ? '취소' : '+ 지도에서 핀 찍기'}
        </button>
      </div>

      {pending && (
        <PendingPlaceForm
          position={pending}
          onCancel={() => setPending(null)}
          onSave={async (name, category, note) => {
            const id = await addPlace({
              tripId,
              destinationId: destinationForPlace(cities, activeDest, pending),
              name,
              category,
              lat: pending.lat,
              lng: pending.lng,
              note,
            })
            setSelectedId(id)
            setPending(null)
          }}
        />
      )}

      <div className="flex flex-wrap gap-1.5">
        <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
          전체 {all.length}
        </Chip>
        {CATEGORY_ORDER.filter((c) => counts[c]).map((c) => (
          <Chip key={c} active={filter === c} onClick={() => setFilter(c)}>
            {CATEGORIES[c].emoji} {CATEGORIES[c].label} {counts[c]}
          </Chip>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">
          {inCity.length === 0
            ? '위에서 장소를 검색해 추가하세요.'
            : '이 카테고리에 장소가 없습니다.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((p) => (
            <PlaceRow
              key={p.id}
              place={p}
              selected={p.id === selectedId}
              onSelect={() => setSelectedId(p.id === selectedId ? null : p.id)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function PlaceRow({
  place,
  selected,
  onSelect,
}: {
  place: Place
  selected: boolean
  onSelect: () => void
}) {
  const cat = CATEGORIES[place.category]
  const [editing, setEditing] = useState(false)
  const [note, setNote] = useState(place.note ?? '')

  return (
    <li
      className={`rounded-xl border bg-white p-3.5 dark:bg-slate-900 ${
        selected
          ? 'border-sky-500'
          : 'border-slate-200 dark:border-slate-800'
      }`}
    >
      <div className="flex items-start gap-3">
        <button type="button" onClick={onSelect} className="text-lg" aria-label={cat.label}>
          {cat.emoji}
        </button>
        <button
          type="button"
          onClick={onSelect}
          className="min-w-0 flex-1 text-left"
        >
          <span className="block truncate font-medium">{place.name}</span>
          {place.address && (
            <span className="block truncate text-xs text-slate-500">
              {place.address}
            </span>
          )}
          {place.note && (
            <span className="mt-1 block text-sm text-sky-600 dark:text-sky-400">
              {place.note}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => void deletePlace(place.id)}
          className="shrink-0 text-xs text-slate-400 hover:text-rose-500"
        >
          삭제
        </button>
      </div>

      {selected && (
        <div className="mt-3 flex flex-col gap-2.5 border-t border-slate-100 pt-3 dark:border-slate-800">
          <div className="flex flex-wrap gap-1.5">
            {CATEGORY_ORDER.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => void updatePlace(place.id, { category: c })}
                className={`rounded-full px-2.5 py-1 text-xs ${
                  place.category === c
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {CATEGORIES[c].emoji} {CATEGORIES[c].label}
              </button>
            ))}
          </div>

          {editing ? (
            <div className="flex gap-2">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="메모 (예: 꿀대구, 사전 예약 필요)"
                className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-900"
              />
              <button
                type="button"
                onClick={async () => {
                  await updatePlace(place.id, { note: note.trim() || undefined })
                  setEditing(false)
                }}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white dark:bg-slate-100 dark:text-slate-900"
              >
                저장
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="self-start text-xs text-slate-500 underline underline-offset-2"
            >
              {place.note ? '메모 수정' : '+ 메모 추가'}
            </button>
          )}

          {place.openingHours && place.openingHours.length > 0 && (
            <details className="text-xs text-slate-500">
              <summary className="cursor-pointer">영업시간</summary>
              <ul className="mt-1.5 flex flex-col gap-0.5">
                {place.openingHours.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </li>
  )
}

function PendingPlaceForm({
  position,
  onCancel,
  onSave,
}: {
  position: { lat: number; lng: number }
  onCancel: () => void
  onSave: (name: string, category: PlaceCategory, note?: string) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState<PlaceCategory>('custom')
  const [note, setNote] = useState('')

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-sky-500 bg-white p-4 dark:bg-slate-900">
      <p className="text-xs text-slate-500">
        {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
      </p>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="장소 이름"
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-900"
      />
      <div className="flex flex-wrap gap-1.5">
        {CATEGORY_ORDER.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={`rounded-full px-2.5 py-1 text-xs ${
              category === c
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            {CATEGORIES[c].emoji} {CATEGORIES[c].label}
          </button>
        ))}
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="메모 (선택)"
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-900"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!name.trim()}
          onClick={() => void onSave(name.trim(), category, note.trim() || undefined)}
          className="flex-1 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
        >
          추가
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-4 py-2.5 text-sm text-slate-500"
        >
          취소
        </button>
      </div>
    </div>
  )
}
