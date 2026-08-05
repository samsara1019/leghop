import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type PackingItem } from '../db/schema'
import {
  addCustomPackingItem,
  applyTemplate,
  deletePackingItem,
  resetChecks,
  togglePackingItem,
} from '../db/packingRepo'
import {
  CATEGORY_SEQUENCE,
  DISCLOSURE,
  buildContext,
  describeContext,
  hasAnyAffiliate,
  recommendedLink,
} from '../lib/packing'
import { useTripSync } from '../lib/useTripSync'
import { Chip } from '../components/Chip'
import { AffiliateLink } from '../components/AffiliateLink'

type Filter = 'all' | 'todo' | 'done'

/** 참조가 매 렌더 바뀌지 않도록 모듈 수준에 둔다 */
const EMPTY: PackingItem[] = []

export function Packing() {
  const { tripId = '' } = useParams()
  useTripSync(tripId)

  const trip = useLiveQuery(() => db.trips.get(tripId), [tripId])
  const destinations = useLiveQuery(
    () => db.destinations.where('tripId').equals(tripId).toArray(),
    [tripId],
  )
  const rows = useLiveQuery(
    () => db.packingItems.where('tripId').equals(tripId).toArray(),
    [tripId],
  )

  const [filter, setFilter] = useState<Filter>('all')
  const [category, setCategory] = useState<string | 'all'>('all')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  // rows는 liveQuery가 갱신될 때만 새 배열이 된다. 여기서 `?? []`를 매 렌더
  // 새로 만들면 아래 useMemo가 전부 무효화되므로 빈 배열을 고정해 둔다.
  const items = rows ?? EMPTY
  const done = items.filter((i) => i.checked).length

  /** 템플릿에 등장하는 순서를 지키고, 사용자가 만든 카테고리는 뒤에 붙인다 */
  const categories = useMemo(() => {
    const present = new Set(items.map((i) => i.category))
    const known = CATEGORY_SEQUENCE.filter((c) => present.has(c))
    const extra = [...present].filter((c) => !CATEGORY_SEQUENCE.includes(c)).sort()
    return [...known, ...extra]
  }, [items])

  const grouped = useMemo(() => {
    const byCategory = new Map<string, PackingItem[]>()
    for (const it of items) {
      if (category !== 'all' && it.category !== category) continue
      if (filter === 'todo' && it.checked) continue
      if (filter === 'done' && !it.checked) continue
      const arr = byCategory.get(it.category)
      if (arr) arr.push(it)
      else byCategory.set(it.category, [it])
    }
    for (const arr of byCategory.values()) arr.sort((a, b) => a.order - b.order)
    return categories
      .filter((c) => byCategory.has(c))
      .map((c) => [c, byCategory.get(c)!] as const)
  }, [items, categories, category, filter])

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

  const ctx = buildContext(destinations ?? [], trip.startDate, trip.endDate)

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label)
    setMessage(null)
    try {
      await fn()
    } catch (err) {
      setMessage(
        String(err).includes('offline')
          ? '오프라인에서는 수정할 수 없습니다.'
          : `실패: ${String(err)}`,
      )
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
        <h1 className="text-xl font-semibold tracking-tight">준비물</h1>
        <p className="text-sm text-slate-500">
          {trip.title} · {describeContext(ctx)}
        </p>
      </header>

      {message && (
        <p className="rounded-lg bg-rose-100 px-3 py-2 text-sm text-rose-900 dark:bg-rose-950 dark:text-rose-200">
          {message}
        </p>
      )}

      {items.length === 0 ? (
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 p-5 text-sm dark:border-slate-800">
          <p className="font-medium">아직 준비물 목록이 없습니다.</p>
          <p className="text-slate-500">
            여행지({describeContext(ctx)})에 맞춰 기본 목록을 만들어 드립니다.
            만든 뒤에 항목을 추가하거나 지울 수 있습니다.
          </p>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() =>
              void run('generate', async () => {
                const r = await applyTemplate(tripId)
                setMessage(`${r.added}개 항목을 만들었습니다.`)
              })
            }
            className="self-start rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
          >
            {busy === 'generate' ? '만드는 중…' : '준비물 목록 만들기'}
          </button>
        </div>
      ) : (
        <>
          <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-sm font-medium">
                {done} / {items.length}
              </span>
              <span className="text-xs text-slate-400">
                {items.length - done}개 남음
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-emerald-500 transition-[width]"
                style={{
                  width: `${items.length ? (done / items.length) * 100 : 0}%`,
                }}
              />
            </div>
          </section>

          {/* 제휴 링크보다 위에 둔다 — 클릭을 결정하기 전에 보여야 한다 */}
          {hasAnyAffiliate(items.map((i) => i.name)) && (
            <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              일부 항목의 <strong>추천템</strong>은 쿠팡 파트너스 링크입니다.{' '}
              {DISCLOSURE}
            </p>
          )}

          <div className="flex flex-wrap gap-1.5">
            <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
              전체 {items.length}
            </Chip>
            <Chip active={filter === 'todo'} onClick={() => setFilter('todo')}>
              남은 것 {items.length - done}
            </Chip>
            <Chip active={filter === 'done'} onClick={() => setFilter('done')}>
              챙긴 것 {done}
            </Chip>
          </div>

          <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5">
            <Chip active={category === 'all'} onClick={() => setCategory('all')}>
              모든 분류
            </Chip>
            {categories.map((c) => (
              <Chip
                key={c}
                active={category === c}
                onClick={() => setCategory(c)}
              >
                {c}
              </Chip>
            ))}
          </div>

          {grouped.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">
              조건에 맞는 항목이 없습니다.
            </p>
          ) : (
            grouped.map(([cat, list]) => (
              <section key={cat}>
                <h2 className="mb-1.5 text-xs font-medium text-slate-500">
                  {cat}{' '}
                  <span className="text-slate-400">
                    {list.filter((i) => i.checked).length}/{list.length}
                  </span>
                </h2>
                <ul className="flex flex-col gap-1">
                  {list.map((it) => (
                    <li key={it.id}>
                      <div className="flex items-start gap-3 rounded-lg border border-slate-200 px-3 py-2.5 dark:border-slate-800">
                        <input
                          type="checkbox"
                          checked={it.checked}
                          onChange={() =>
                            void run('toggle', () => togglePackingItem(it.id))
                          }
                          className="mt-0.5 size-4 shrink-0 accent-emerald-600"
                          aria-label={it.name}
                        />
                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-sm ${
                              it.checked
                                ? 'text-slate-400 line-through'
                                : ''
                            }`}
                          >
                            {it.name}
                            {it.source === 'custom' && (
                              <span className="ml-1.5 text-xs text-sky-500">
                                직접 추가
                              </span>
                            )}
                          </p>
                          {it.note && (
                            <p className="text-xs text-slate-500">{it.note}</p>
                          )}
                        </div>
                        {(() => {
                          const link = recommendedLink(it.name)
                          return link ? <AffiliateLink href={link} item={it.name} /> : null
                        })()}
                        <button
                          type="button"
                          onClick={() =>
                            void run('delete', () => deletePackingItem(it.id))
                          }
                          className="shrink-0 text-xs text-slate-300 hover:text-rose-500"
                          aria-label={`${it.name} 삭제`}
                        >
                          ✕
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}

          {adding ? (
            <AddForm
              categories={categories}
              onClose={() => setAdding(false)}
              onSubmit={async (cat, name, note) => {
                const r = await addCustomPackingItem(tripId, cat, name, note)
                if (r === 'duplicate') {
                  setMessage(`이미 있는 항목입니다: ${name}`)
                  return false
                }
                setMessage(null)
                return true
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="rounded-lg border border-dashed border-slate-300 px-4 py-2.5 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300"
            >
              + 항목 추가
            </button>
          )}

          <div className="mt-2 flex flex-wrap gap-3 border-t border-slate-200 pt-3 text-xs dark:border-slate-800">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() =>
                void run('generate', async () => {
                  const r = await applyTemplate(tripId)
                  setMessage(
                    `추가 ${r.added} · 유지 ${r.kept} · 정리 ${r.removed}`,
                  )
                })
              }
              className="text-slate-500 underline underline-offset-2"
            >
              {busy === 'generate' ? '적용 중…' : '템플릿 다시 적용'}
            </button>
            <button
              type="button"
              disabled={busy !== null || done === 0}
              onClick={() => {
                if (!confirm('체크를 모두 해제할까요?')) return
                void run('reset', () => resetChecks(tripId))
              }}
              className="text-slate-500 underline underline-offset-2 disabled:opacity-40"
            >
              체크 초기화
            </button>
          </div>

          <p className="text-xs text-slate-400">
            템플릿을 다시 적용해도 <strong>직접 추가한 항목과 체크 상태는
            유지</strong>됩니다. 여행지·날짜를 바꾼 뒤 눌러보세요.
          </p>

        </>
      )}
    </div>
  )
}

function AddForm({
  categories,
  onSubmit,
  onClose,
}: {
  categories: string[]
  onSubmit: (category: string, name: string, note?: string) => Promise<boolean>
  onClose: () => void
}) {
  const [category, setCategory] = useState(categories[0] ?? '생활용품')
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-sky-500 p-4">
      <div className="flex gap-2">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        >
          {(categories.length ? categories : CATEGORY_SEQUENCE).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="준비물"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-900"
        />
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="비고 (선택)"
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-900"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy || !name.trim()}
          onClick={async () => {
            setBusy(true)
            try {
              const ok = await onSubmit(category, name, note)
              if (ok) {
                setName('')
                setNote('')
              }
            } finally {
              setBusy(false)
            }
          }}
          className="flex-1 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
        >
          {busy ? '추가 중…' : '추가'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-4 py-2.5 text-sm text-slate-500"
        >
          닫기
        </button>
      </div>
    </div>
  )
}
