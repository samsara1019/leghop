import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Destination } from '../db/schema'
import { createTrip, deleteTrip } from '../db/repo'
import { PlaceSearch } from '../components/PlaceSearch'
import { hasMapsKey } from '../lib/env'
import { todayISO } from '../lib/dates'
import { routeSummary } from '../lib/destinations'
import { useAuth } from '../lib/authContext'
import { clearMirror, mirrorTripList } from '../db/sync'
import { deleteMyAccount } from '../db/remote'

export function TripList() {
  const { user, signOut } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const trips = useLiveQuery(() => db.trips.orderBy('startDate').toArray(), [])
  const destinations = useLiveQuery(() => db.destinations.toArray(), [])
  const [creating, setCreating] = useState(false)

  /** 여행 카드에 "바르셀로나 → 세비야 → 마요르카"를 보여주려면 여행별로 묶어야 한다 */
  const routeByTrip = useMemo(() => {
    const grouped = new Map<string, Destination[]>()
    for (const d of destinations ?? []) {
      const arr = grouped.get(d.tripId)
      if (arr) arr.push(d)
      else grouped.set(d.tripId, [d])
    }
    return new Map(
      [...grouped].map(([tripId, list]) => [tripId, routeSummary(list)]),
    )
  }, [destinations])

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 p-5">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Leghop</h1>
        <div className="flex items-center gap-3 text-xs">
          <button
            type="button"
            onClick={() => void mirrorTripList().catch((e) => setError(String(e)))}
            className="text-slate-400 underline underline-offset-2"
          >
            새로고침
          </button>
          <Link to="/debug" className="text-slate-400 underline underline-offset-2">
            점검
          </Link>
          <span className="max-w-32 truncate text-slate-400" title={user?.email ?? ''}>
            {user?.email}
          </span>
          <button
            type="button"
            onClick={() => void signOut()}
            className="text-slate-400 underline underline-offset-2"
          >
            로그아웃
          </button>
        </div>
      </header>

      {error && (
        <p className="rounded-lg bg-rose-100 px-3 py-2 text-sm text-rose-900 dark:bg-rose-950 dark:text-rose-200">
          {error}
        </p>
      )}

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
                <span className="block truncate text-sm text-slate-500">
                  {routeByTrip.get(t.id) || '도시 없음'}
                </span>
                <span className="block text-xs text-slate-400">
                  {t.startDate} ~ {t.endDate}
                </span>
              </Link>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`"${t.title}"을(를) 삭제할까요? 등록한 장소도 함께 지워집니다.`)) {
                    void deleteTrip(t.id).catch((e) =>
                      setError(
                        String(e).includes('offline')
                          ? '오프라인에서는 삭제할 수 없습니다.'
                          : '삭제에 실패했습니다. 소유자만 삭제할 수 있습니다.',
                      ),
                    )
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

      <AccountSection onDone={() => void signOut()} />
    </div>
  )
}

/**
 * 개인정보보호법은 목적 달성 후 지체 없는 파기를 요구한다. 이메일로 요청받아
 * 처리하면 지연되고 누락되므로 앱에서 바로 지울 수 있게 둔다.
 */
function AccountSection({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)

  return (
    <section className="mt-6 border-t border-slate-200 pt-4 text-xs dark:border-slate-800">
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-slate-400">
        <a
          href="/privacy"
          className="underline underline-offset-2"
        >
          개인정보처리방침
        </a>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="underline underline-offset-2"
        >
          회원 탈퇴
        </button>
      </p>

      {open && (
        <div className="mt-3 flex flex-col gap-2.5 rounded-xl border border-rose-300 p-4 dark:border-rose-900">
          <p className="text-sm font-medium text-rose-700 dark:text-rose-300">
            계정과 모든 데이터를 삭제합니다
          </p>
          <ul className="flex list-disc flex-col gap-1 pl-4 text-slate-600 dark:text-slate-300">
            <li>내가 만든 모든 여행과 장소·일정·준비물</li>
            <li>업로드한 서류 파일 전체</li>
            <li>계정 정보(이메일·이름)</li>
          </ul>
          <p className="text-slate-500">
            공유받은 여행은 참여만 해제되고 그 여행 자체는 남습니다.
            <strong className="text-rose-600 dark:text-rose-400">
              {' '}
              되돌릴 수 없습니다.
            </strong>
          </p>
          <label className="flex flex-col gap-1.5">
            <span className="text-slate-500">
              계속하려면 <strong>삭제</strong>를 입력하세요
            </span>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="삭제"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-rose-500 dark:border-slate-700 dark:bg-slate-900"
            />
          </label>
          {failed && (
            <p className="text-rose-600 dark:text-rose-400">{failed}</p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || confirmText.trim() !== '삭제'}
              onClick={async () => {
                setBusy(true)
                setFailed(null)
                try {
                  await deleteMyAccount()
                  // 서버에서 지웠으니 이 기기의 사본도 남기지 않는다
                  await clearMirror()
                  onDone()
                } catch (err) {
                  setFailed(
                    String(err).includes('offline')
                      ? '오프라인에서는 탈퇴할 수 없습니다.'
                      : `삭제 실패: ${String(err).replace(/^Error:\s*/, '')}`,
                  )
                  setBusy(false)
                }
              }}
              className="rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
            >
              {busy ? '삭제 중…' : '영구 삭제'}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setConfirmText('')
                setFailed(null)
              }}
              className="rounded-lg px-4 py-2.5 text-sm text-slate-500"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

function NewTripForm({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState('')
  const [city, setCity] = useState<{ name: string; lat: number; lng: number } | null>(
    null,
  )
  const today = todayISO()
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)

  const valid = city !== null && startDate <= endDate

  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)

  async function submit() {
    if (!city) return
    setSaving(true)
    setFailed(null)
    try {
      await createTrip({
        title: title.trim() || city.name,
        startDate,
        endDate,
        firstCity: city,
      })
      onDone()
    } catch (err) {
      setFailed(
        String(err).includes('offline')
          ? '오프라인에서는 새 여행을 만들 수 없습니다.'
          : `저장 실패: ${String(err)}`,
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <Field label="첫 도시">
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

      {failed && (
        <p className="rounded-lg bg-rose-100 px-3 py-2 text-sm text-rose-900 dark:bg-rose-950 dark:text-rose-200">
          {failed}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={!valid || saving}
          onClick={() => void submit()}
          className="flex-1 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
        >
          {saving ? '만드는 중…' : '만들기'}
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
