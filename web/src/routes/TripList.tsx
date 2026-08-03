import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'
import { createTrip, deleteTrip } from '../db/repo'
import { PlaceSearch } from '../components/PlaceSearch'
import { hasMapsKey } from '../lib/env'

export function TripList() {
  const trips = useLiveQuery(() => db.trips.orderBy('startDate').toArray(), [])
  const [creating, setCreating] = useState(false)

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 p-5">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Leghop</h1>
        <Link
          to="/debug"
          className="text-xs text-slate-400 underline underline-offset-2"
        >
          환경 점검
        </Link>
      </header>

      {!hasMapsKey && (
        <p className="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Google Maps 키가 없어 장소 검색이 동작하지 않습니다. README 참고.
        </p>
      )}

      {creating ? (
        <NewTripForm onDone={() => setCreating(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900"
        >
          + 새 여행
        </button>
      )}

      {trips === undefined ? (
        <p className="text-sm text-slate-400">불러오는 중…</p>
      ) : trips.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">
          아직 여행이 없습니다.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {trips.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <Link to={`/trip/${t.id}`} className="min-w-0 flex-1">
                <span className="block truncate font-medium">{t.title}</span>
                <span className="block text-sm text-slate-500">
                  {t.city} · {t.startDate} ~ {t.endDate}
                </span>
              </Link>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`"${t.title}"을(를) 삭제할까요? 등록한 장소도 함께 지워집니다.`)) {
                    void deleteTrip(t.id)
                  }
                }}
                className="shrink-0 text-xs text-slate-400 hover:text-rose-500"
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function NewTripForm({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState('')
  const [city, setCity] = useState<{ name: string; lat: number; lng: number } | null>(
    null,
  )
  const today = new Date().toISOString().slice(0, 10)
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)

  const valid = city !== null && startDate <= endDate

  async function submit() {
    if (!city) return
    await createTrip({
      title: title.trim() || city.name,
      city: city.name,
      lat: city.lat,
      lng: city.lng,
      startDate,
      endDate,
    })
    onDone()
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <Field label="도시">
        {city ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="flex-1 truncate">{city.name}</span>
            <button
              type="button"
              onClick={() => setCity(null)}
              className="text-xs text-slate-400 underline"
            >
              변경
            </button>
          </div>
        ) : (
          <PlaceSearch
            placeholder="도시 검색 (예: 바르셀로나)"
            onSelect={(p) => setCity({ name: p.name, lat: p.lat, lng: p.lng })}
          />
        )}
      </Field>

      <Field label="여행 이름">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={city ? `${city.name} 여행` : '비우면 도시 이름을 씁니다'}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-900"
        />
      </Field>

      <div className="flex gap-3">
        <Field label="시작">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-900"
          />
        </Field>
        <Field label="종료">
          <input
            type="date"
            value={endDate}
            min={startDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-900"
          />
        </Field>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={!valid}
          onClick={() => void submit()}
          className="flex-1 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
        >
          만들기
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg px-4 py-2.5 text-sm text-slate-500"
        >
          취소
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-1 flex-col gap-1.5">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  )
}
