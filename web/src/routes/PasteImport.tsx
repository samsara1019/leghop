import { useState, type ClipboardEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { useMapsLibrary } from '@vis.gl/react-google-maps'
import { db, type PlaceCategory } from '../db/schema'
import { addPlace, findPlaceByGoogleId } from '../db/repo'
import {
  addActivity,
  addStop,
  ensureDays,
  setLegModeByItems,
  updateItem,
} from '../db/plannerRepo'
import { CATEGORIES, CATEGORY_ORDER } from '../lib/categories'
import { MODE_EMOJI, MODE_LABEL } from '../lib/directions'
import { hasParser } from '../lib/env'
import {
  defaultBias,
  destinationForDate,
  sortDestinations,
} from '../lib/destinations'
import {
  COLUMN_ROLE_LABEL,
  guessColumns,
  parseClipboard,
  type ColumnRole,
  type ParsedClipboard,
} from '../lib/pasteParse'
import {
  draftCategory,
  draftsFromProseGemini,
  draftsFromProseLocal,
  draftsFromTable,
  searchCandidates,
  type Draft,
} from '../lib/importDraft'
import { PlaceSearch } from '../components/PlaceSearch'

const ROLE_OPTIONS: ColumnRole[] = [
  'name',
  'note',
  'category',
  'durationMin',
  'startAt',
  'ignore',
]

export function PasteImport() {
  const { tripId = '' } = useParams()
  const navigate = useNavigate()
  const trip = useLiveQuery(() => db.trips.get(tripId), [tripId])
  const placesLib = useMapsLibrary('places')

  const [raw, setRaw] = useState('')
  const [parsed, setParsed] = useState<ParsedClipboard | null>(null)
  const [roles, setRoles] = useState<ColumnRole[]>([])
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [stage, setStage] = useState<'input' | 'review'>('input')
  const [busy, setBusy] = useState<string | null>(null)
  const [source, setSource] = useState<'table' | 'gemini' | 'local' | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [targetDayId, setTargetDayId] = useState<string>('')

  const days = useLiveQuery(
    () => db.days.where('tripId').equals(tripId).sortBy('date'),
    [tripId],
  )
  const destinations = useLiveQuery(
    () => db.destinations.where('tripId').equals(tripId).toArray(),
    [tripId],
  )
  /** 어느 도시 기준으로 검색·등록할지. 빈 값이면 첫 도시 */
  const [destId, setDestId] = useState('')

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
  // 호이스팅되는 function 선언 안에서는 위 가드로 좁혀진 타입이 유지되지 않는다.
  // 필요한 값만 원시값으로 꺼내 쓴다.
  const cities = sortDestinations(destinations ?? [])
  const activeDest = cities.find((d) => d.id === destId) ?? cities[0]
  const city = activeDest?.name ?? ''
  const bias = activeDest
    ? { lat: activeDest.lat, lng: activeDest.lng }
    : (defaultBias(cities) ?? { lat: 0, lng: 0 })
  const activeDestId = activeDest?.id
  const tripStart = trip.startDate
  const tripEnd = trip.endDate

  function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const html = e.clipboardData.getData('text/html')
    const text = e.clipboardData.getData('text/plain')
    if (!text.trim() && !html.trim()) return
    e.preventDefault()
    setRaw(text)
    applyParse(parseClipboard(html, text))
  }

  function applyParse(result: ParsedClipboard) {
    setParsed(result)
    setWarning(null)
    if (result.kind === 'table') setRoles(guessColumns(result))
  }

  /** 후보 검색은 stop 항목에 대해서만, 순차로 돈다 (Text Search는 건당 과금) */
  async function runCandidateSearch(list: Draft[]): Promise<Draft[]> {
    if (!placesLib) return list
    const out = [...list]
    for (let i = 0; i < out.length; i++) {
      const d = out[i]
      if (d.kind !== 'stop' || !d.query) continue
      setBusy(`장소 찾는 중… (${i + 1}/${out.length})`)
      try {
        // 검색어에 여행 도시명을 덧붙이지 않는다. 지역 편향(locationBias)만으로
        // 충분하고, 붙이면 근교나 다른 도시의 장소를 못 찾는다
        // (바르셀로나 여행 중 몬세라트·지로나 같은 근교 일정).
        const candidates = await searchCandidates(placesLib, d.query, bias)
        out[i] = {
          ...d,
          candidates,
          chosenIndex: candidates.length ? 0 : null,
          status: candidates.length ? 'matched' : 'nomatch',
        }
      } catch (err) {
        console.error('후보 검색 실패', d.query, err)
        out[i] = { ...d, status: 'nomatch' }
      }
      setDrafts([...out])
    }
    return out
  }

  async function analyze() {
    if (!parsed) return
    setBusy('분석 중…')
    try {
      let list: Draft[]
      if (parsed.kind === 'table') {
        list = draftsFromTable(parsed, roles)
        setSource('table')
      } else if (hasParser) {
        try {
          list = await draftsFromProseGemini(raw, city)
          setSource('gemini')
        } catch (err) {
          console.error('Gemini 파싱 실패, 규칙 기반으로 대체', err)
          list = draftsFromProseLocal(parsed.lines)
          setSource('local')
          setWarning('Gemini 파싱에 실패해 규칙 기반으로 처리했습니다.')
        }
      } else {
        list = draftsFromProseLocal(parsed.lines)
        setSource('local')
      }

      if (list.length === 0) {
        setWarning('가져올 항목을 찾지 못했습니다.')
        return
      }
      setDrafts(list)
      setStage('review')
      await runCandidateSearch(list)
    } finally {
      setBusy(null)
    }
  }

  function patch(id: string, next: Partial<Draft>) {
    setDrafts((cur) => cur.map((d) => (d.id === id ? { ...d, ...next } : d)))
  }

  const importable = drafts.filter(
    (d) =>
      d.status !== 'skipped' &&
      (d.kind === 'activity' || (d.kind === 'stop' && d.chosenIndex !== null)),
  )

  async function commit() {
    setBusy('추가 중…')
    try {
      const dayId = targetDayId || null
      if (dayId) {
        // Day가 아직 없을 수도 있으니 한 번 보장한다
        await ensureDays(tripId, tripStart, tripEnd)
      }

      let lastStopItemId: string | null = null
      let pendingMode: Draft['modeHints'] | null = null
      const legFixes: { from: string; to: string; mode: NonNullable<Draft['modeHints']>[number] }[] = []
      let added = 0
      let skippedDup = 0

      for (const d of drafts) {
        if (d.status === 'skipped') continue

        if (d.kind === 'transfer') {
          // 이동 힌트는 항목이 아니라 다음 구간의 수단으로 반영한다
          if (d.modeHints?.length) pendingMode = d.modeHints
          continue
        }

        if (d.kind === 'activity') {
          if (!dayId) continue
          const itemId = await addActivity(dayId, d.title ?? '활동', d.durationMin ?? 60)
          if (d.startAt) await updateItem(itemId, { startAt: d.startAt })
          added++
          continue
        }

        const chosen = d.chosenIndex !== null ? d.candidates[d.chosenIndex] : null
        if (!chosen) continue

        const dup = await findPlaceByGoogleId(tripId, chosen.googlePlaceId)
        const placeId =
          dup?.id ??
          (await addPlace({
            tripId,
            destinationId: activeDestId,
            googlePlaceId: chosen.googlePlaceId,
            name: chosen.name,
            category: draftCategory(d),
            lat: chosen.lat,
            lng: chosen.lng,
            address: chosen.address,
            note: d.note,
          }))
        if (dup) skippedDup++
        else added++

        if (dayId) {
          const itemId = await addStop(dayId, placeId, d.durationMin ?? 60)
          if (d.startAt) await updateItem(itemId, { startAt: d.startAt })
          if (lastStopItemId && pendingMode?.length) {
            legFixes.push({ from: lastStopItemId, to: itemId, mode: pendingMode[0] })
          }
          lastStopItemId = itemId
          pendingMode = null
        }
      }

      // Leg는 항목이 다 들어간 뒤에 존재하므로 마지막에 수단을 박는다
      if (dayId) {
        for (const fix of legFixes) {
          await setLegModeByItems(dayId, fix.from, fix.to, fix.mode)
        }
      }

      navigate(dayId ? `/trip/${tripId}/plan` : `/trip/${tripId}`)
      console.info(`가져오기 완료: 신규 ${added}건, 중복 ${skippedDup}건`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-5 pb-24">
      <header>
        <Link to={`/trip/${tripId}`} className="text-xs text-slate-400">
          ← 장소 서랍
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">붙여넣기로 가져오기</h1>
        <p className="text-sm text-slate-500">{trip.title}</p>
      </header>

      {stage === 'input' ? (
        <>
          <textarea
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value)
              setParsed(null)
            }}
            onPaste={handlePaste}
            rows={10}
            placeholder={
              '엑셀 표를 그대로 붙여넣거나, 메모를 줄 단위로 붙여넣으세요.\n\n' +
              '예)\n바르셀로나 공항 도착 후 입국 심사 및 짐 찾기\n' +
              '공항버스(Aerobus)로 시내 이동\n라 플라우타에서 꿀대구 먹기'
            }
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-mono text-sm outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-900"
          />

          {parsed && (
            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              {parsed.kind === 'table' ? (
                <>
                  <p className="mb-3 text-sm">
                    <strong>표</strong>로 인식했습니다 · {parsed.rows.length}행
                    {parsed.headers ? ' (머리글 있음)' : ''}
                  </p>
                  <p className="mb-2 text-xs text-slate-500">
                    각 열의 역할을 확인하세요.
                  </p>
                  <div className="flex flex-col gap-2">
                    {roles.map((role, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span className="w-28 shrink-0 truncate text-xs text-slate-500">
                          {parsed.headers?.[i] || `${i + 1}번째 열`}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-xs text-slate-400">
                          {parsed.rows[0]?.[i] ?? ''}
                        </span>
                        <select
                          value={role}
                          onChange={(e) =>
                            setRoles((cur) =>
                              cur.map((r, j) =>
                                j === i ? (e.target.value as ColumnRole) : r,
                              ),
                            )
                          }
                          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                        >
                          {ROLE_OPTIONS.map((r) => (
                            <option key={r} value={r}>
                              {COLUMN_ROLE_LABEL[r]}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm">
                    <strong>텍스트</strong>로 인식했습니다 · {parsed.lines.length}줄
                  </p>
                  <p className="mt-1.5 text-xs text-slate-500">
                    {hasParser
                      ? 'Gemini로 항목을 구조화합니다.'
                      : 'Worker가 설정되지 않아 규칙 기반으로 처리합니다. 정확도가 낮을 수 있습니다.'}
                  </p>
                </>
              )}
            </div>
          )}

          {!parsed && raw.trim() && (
            <button
              type="button"
              onClick={() => applyParse(parseClipboard('', raw))}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm dark:border-slate-700"
            >
              내용 인식
            </button>
          )}

          {warning && (
            <p className="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              {warning}
            </p>
          )}

          <button
            type="button"
            disabled={!parsed || busy !== null || !placesLib}
            onClick={() => void analyze()}
            className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
          >
            {busy ?? '분석하기'}
          </button>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">
              {source === 'table' && '표에서 인식'}
              {source === 'gemini' && 'Gemini로 인식'}
              {source === 'local' && '규칙 기반으로 인식'}
              {' · '}
              {drafts.length}건
            </span>
            <button
              type="button"
              onClick={() => {
                setStage('input')
                setDrafts([])
              }}
              className="text-xs text-slate-400 underline"
            >
              다시 붙여넣기
            </button>
          </div>

          {warning && (
            <p className="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              {warning}
            </p>
          )}

          <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            자동으로 확정하지 않습니다. 잘못 잡힌 장소가 하나 있으면 현지에서
            30분을 날립니다 — 아래에서 한 번 확인해 주세요.
          </p>

          <ul className="flex flex-col gap-2.5">
            {drafts.map((d) => (
              <DraftRow
                key={d.id}
                draft={d}
                bias={bias}
                onPatch={(next) => patch(d.id, next)}
              />
            ))}
          </ul>

          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            {cities.length > 1 && (
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-slate-500">
                  어느 도시의 장소인가
                </span>
                <select
                  value={activeDestId ?? ''}
                  onChange={(e) => setDestId(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  {cities.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-slate-400">
                  이 도시 주변으로 검색합니다. 도시가 섞여 있으면 도시별로 나눠
                  붙여넣는 게 정확합니다.
                </span>
              </label>
            )}
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-slate-500">
                일정에도 추가할 날짜
              </span>
              <select
                value={targetDayId}
                onChange={(e) => {
                  const id = e.target.value
                  setTargetDayId(id)
                  // 날짜를 고르면 그날 머무는 도시로 기준을 옮긴다
                  const picked = (days ?? []).find((d) => d.id === id)
                  if (picked) {
                    const c = destinationForDate(cities, picked.date)
                    if (c) setDestId(c.id)
                  }
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="">장소 서랍에만 추가</option>
                {(days ?? []).map((d, i) => (
                  <option key={d.id} value={d.id}>
                    Day {i + 1} · {d.date}
                  </option>
                ))}
              </select>
            </label>
            {!targetDayId && (
              <p className="text-xs text-slate-400">
                날짜를 고르면 순서대로 일정에 배치하고, "공항버스로 이동" 같은
                이동 힌트를 해당 구간의 수단으로 반영합니다.
              </p>
            )}
          </div>

          <button
            type="button"
            disabled={busy !== null || importable.length === 0}
            onClick={() => void commit()}
            className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
          >
            {busy ?? `${importable.length}건 추가`}
          </button>
        </>
      )}
    </div>
  )
}

function DraftRow({
  draft,
  bias,
  onPatch,
}: {
  draft: Draft
  bias: { lat: number; lng: number }
  onPatch: (next: Partial<Draft>) => void
}) {
  const [manual, setManual] = useState(false)
  const skipped = draft.status === 'skipped'

  return (
    <li
      className={`rounded-xl border p-3.5 ${
        skipped
          ? 'border-slate-200 opacity-50 dark:border-slate-800'
          : 'border-slate-200 dark:border-slate-800'
      }`}
    >
      <div className="flex items-start gap-2">
        <span className="text-xs text-slate-400">
          {draft.kind === 'stop' ? '장소' : draft.kind === 'activity' ? '활동' : '이동'}
        </span>
        <div className="min-w-0 flex-1">
          {draft.kind === 'transfer' ? (
            <p className="text-sm">
              {draft.note}
              {draft.modeHints?.length ? (
                <span className="ml-1.5 text-xs text-slate-500">
                  → {draft.modeHints.map((m) => `${MODE_EMOJI[m]} ${MODE_LABEL[m]}`).join(' / ')}
                </span>
              ) : null}
            </p>
          ) : draft.kind === 'activity' ? (
            <p className="text-sm font-medium">
              {draft.title}
              <span className="ml-1.5 text-xs text-slate-500">
                {draft.durationMin ?? 60}분
              </span>
            </p>
          ) : (
            <p className="truncate text-sm text-slate-500">"{draft.query}"</p>
          )}
        </div>
        <button
          type="button"
          onClick={() =>
            onPatch({ status: skipped ? (draft.candidates.length ? 'matched' : 'nomatch') : 'skipped' })
          }
          className="shrink-0 text-xs text-slate-400 underline"
        >
          {skipped ? '되살리기' : '건너뛰기'}
        </button>
      </div>

      {draft.kind === 'stop' && !skipped && (
        <div className="mt-2.5">
          {draft.status === 'pending' || draft.status === 'searching' ? (
            <p className="text-xs text-slate-400">검색 중…</p>
          ) : draft.candidates.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {draft.candidates.map((c, i) => (
                <li key={c.googlePlaceId}>
                  <button
                    type="button"
                    onClick={() => onPatch({ chosenIndex: i, status: 'matched' })}
                    className={`flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-left text-sm ${
                      draft.chosenIndex === i
                        ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/40'
                        : 'border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <span className="mt-0.5 text-xs text-slate-400">
                      {draft.chosenIndex === i ? '●' : '○'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{c.name}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {c.address}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-rose-500">검색 결과가 없습니다.</p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {CATEGORY_ORDER.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onPatch({ category: c })}
                className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${
                  draftCategory(draft) === c
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {CATEGORIES[c as PlaceCategory].emoji}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setManual((v) => !v)}
              className="ml-auto text-xs text-slate-400 underline"
            >
              {manual ? '닫기' : '직접 검색'}
            </button>
          </div>

          {manual && (
            <div className="mt-2">
              <PlaceSearch
                bias={bias}
                placeholder="장소를 직접 검색"
                onSelect={(p) => {
                  onPatch({
                    candidates: [
                      {
                        googlePlaceId: p.googlePlaceId,
                        name: p.name,
                        address: p.address,
                        lat: p.lat,
                        lng: p.lng,
                        types: p.types,
                      },
                      ...draft.candidates,
                    ],
                    chosenIndex: 0,
                    status: 'matched',
                  })
                  setManual(false)
                }}
              />
            </div>
          )}
        </div>
      )}
    </li>
  )
}
