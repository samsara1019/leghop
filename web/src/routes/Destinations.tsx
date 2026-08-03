import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'
import { addDestination, deleteDestination, updateDestination } from '../db/repo'
import { PlaceSearch } from '../components/PlaceSearch'
import { defaultBias, sortDestinations } from '../lib/destinations'
import { eachDateISO } from '../lib/dates'

export function Destinations() {
  const { tripId = '' } = useParams()
  const trip = useLiveQuery(() => db.trips.get(tripId), [tripId])
  const destinations = useLiveQuery(
    () => db.destinations.where('tripId').equals(tripId).toArray(),
    [tripId],
  )
  const [adding, setAdding] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

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

  const list = sortDestinations(destinations ?? [])
  const dates = eachDateISO(trip.startDate, trip.endDate)
  const bias = defaultBias(list)

  /** 각 도시에 며칠 머무는지 — 다음 도시의 시작일까지가 이 도시의 기간이다 */
  function nightsOf(index: number): number {
    const start = list[index].startDate
    const end = list[index + 1]?.startDate ?? null
    return dates.filter((d) => d >= start && (end === null || d < end)).length
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-5">
      <header>
        <Link to={`/trip/${tripId}`} className="text-xs text-slate-400">
          ← 장소 서랍
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">방문 도시</h1>
        <p className="text-sm text-slate-500">
          {trip.title} · {trip.startDate} ~ {trip.endDate}
        </p>
      </header>

      <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        도시마다 <strong>머무는 첫날</strong>만 지정하면 됩니다. 다음 도시가 시작하는
        날까지가 이 도시의 기간입니다.
      </p>

      {notice && (
        <p className="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {notice}
        </p>
      )}

      <ol className="flex flex-col gap-2.5">
        {list.map((d, i) => (
          <li
            key={d.id}
            className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs text-white dark:bg-slate-100 dark:text-slate-900">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{d.name}</p>
                <p className="text-xs text-slate-500">
                  {d.startDate} 부터 · {nightsOf(i)}일
                </p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  const r = await deleteDestination(d.id)
                  setNotice(
                    r === 'last'
                      ? '마지막 도시는 지울 수 없습니다. 새 도시를 추가한 뒤 지우세요.'
                      : null,
                  )
                }}
                className="shrink-0 text-xs text-slate-400 hover:text-rose-500"
              >
                삭제
              </button>
            </div>

            <label className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
              <span className="text-slate-500">머무는 첫날</span>
              <input
                type="date"
                value={d.startDate}
                min={trip.startDate}
                max={trip.endDate}
                onChange={(e) =>
                  void updateDestination(d.id, { startDate: e.target.value })
                }
                className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
          </li>
        ))}
      </ol>

      {adding ? (
        <div className="flex flex-col gap-2.5 rounded-xl border border-sky-500 bg-white p-4 dark:bg-slate-900">
          <p className="text-sm font-medium">도시 추가</p>
          <PlaceSearch
            bias={bias}
            placeholder="도시 검색 (예: 세비야)"
            onSelect={async (p) => {
              // 기본 시작일은 마지막 도시 다음 날 — 대개 이게 맞고, 아니면 위에서 고친다
              const last = list[list.length - 1]
              const lastIdx = last ? dates.indexOf(last.startDate) : -1
              const suggested = dates[Math.min(lastIdx + 1, dates.length - 1)] ?? trip.startDate
              await addDestination(
                tripId,
                { name: p.name, lat: p.lat, lng: p.lng },
                suggested,
              )
              setAdding(false)
              setNotice(null)
            }}
          />
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="self-start text-xs text-slate-500 underline"
          >
            취소
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900"
        >
          + 도시 추가
        </button>
      )}
    </div>
  )
}
