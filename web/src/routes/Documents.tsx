import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type DocumentCategory, type TripDocument } from '../db/schema'
import {
  DOCUMENT_CATEGORIES,
  MAX_FILE_BYTES,
  addDocument,
  cacheAllDocuments,
  cachedDocumentIds,
  categoryLabel,
  deleteDocument,
  formatBytes,
  getDocumentBlob,
} from '../db/documentRepo'
import { pruneOrphanBlobs } from '../db/sync'
import { useTripSync } from '../lib/useTripSync'
import { Chip } from '../components/Chip'

export function Documents() {
  const { tripId = '' } = useParams()
  useTripSync(tripId)

  const trip = useLiveQuery(() => db.trips.get(tripId), [tripId])
  const docs = useLiveQuery(
    () => db.documents.where('tripId').equals(tripId).sortBy('createdAt'),
    [tripId],
  )

  const [cached, setCached] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<DocumentCategory | 'all'>('all')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [viewing, setViewing] = useState<TripDocument | null>(null)

  const refreshCached = useCallback(async () => {
    await pruneOrphanBlobs(tripId)
    setCached(await cachedDocumentIds(tripId))
  }, [tripId])

  useEffect(() => {
    void refreshCached()
  }, [refreshCached, docs])

  const items = docs ?? []
  const visible =
    filter === 'all' ? items : items.filter((d) => d.category === filter)
  const notCached = items.filter((d) => !cached.has(d.id))
  const totalBytes = items.reduce((n, d) => n + d.sizeBytes, 0)

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

  const present = new Set(items.map((d) => d.category))

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-5 pb-24">
      <header>
        <Link to={`/trip/${tripId}`} className="text-xs text-slate-400">
          ← 장소 서랍
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">서류보관함</h1>
        <p className="text-sm text-slate-500">
          {trip.title} · {items.length}건 · {formatBytes(totalBytes)}
        </p>
      </header>

      {error && (
        <p className="rounded-lg bg-rose-100 px-3 py-2 text-sm text-rose-900 dark:bg-rose-950 dark:text-rose-200">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-lg bg-emerald-100 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          {message}
        </p>
      )}

      {/* 오프라인 준비 상태 — 이 기능의 존재 이유라서 가장 위에 둔다 */}
      <section
        className={`rounded-xl border p-4 text-sm ${
          items.length === 0
            ? 'border-slate-200 dark:border-slate-800'
            : notCached.length === 0
              ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
              : 'border-amber-400 bg-amber-50 dark:bg-amber-950/30'
        }`}
      >
        {items.length === 0 ? (
          <p className="text-slate-500">
            바우처·항공권·예약 확인서를 올려두면 <strong>데이터가 없어도</strong>{' '}
            열어볼 수 있습니다.
          </p>
        ) : notCached.length === 0 ? (
          <p className="font-medium text-emerald-900 dark:text-emerald-200">
            📴 {items.length}건 모두 이 기기에 저장됨 — 오프라인에서 열립니다
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="font-medium text-amber-900 dark:text-amber-200">
              {notCached.length}건이 아직 이 기기에 없습니다
            </p>
            <p className="text-xs text-amber-900/70 dark:text-amber-200/70">
              지금 저장해두면 현지에서 네트워크 없이 열 수 있습니다.
            </p>
            <button
              type="button"
              disabled={busy !== null}
              onClick={async () => {
                setBusy('cache')
                setError(null)
                try {
                  const r = await cacheAllDocuments(tripId)
                  await refreshCached()
                  setMessage(
                    r.failed > 0
                      ? `${r.cached}건 저장, ${r.failed}건 실패`
                      : `${r.cached}건 모두 저장했습니다`,
                  )
                } catch (err) {
                  setError(String(err))
                } finally {
                  setBusy(null)
                }
              }}
              className="self-start rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
            >
              {busy === 'cache' ? '저장 중…' : '오프라인용으로 저장'}
            </button>
          </div>
        )}
      </section>

      {items.length > 0 && (
        <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5">
          <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
            전체 {items.length}
          </Chip>
          {DOCUMENT_CATEGORIES.filter((c) => present.has(c.value)).map((c) => (
            <Chip
              key={c.value}
              active={filter === c.value}
              onClick={() => setFilter(c.value)}
            >
              {c.label} {items.filter((d) => d.category === c.value).length}
            </Chip>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">
          {items.length === 0
            ? '아직 서류가 없습니다.'
            : '이 분류에 서류가 없습니다.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((d) => (
            <li
              key={d.id}
              className="flex items-start gap-3 rounded-xl border border-slate-200 p-3.5 dark:border-slate-800"
            >
              <span className="mt-0.5 text-lg" aria-hidden>
                {d.mimeType.startsWith('image/') ? '🖼️' : '📄'}
              </span>
              <button
                type="button"
                onClick={() => setViewing(d)}
                className="min-w-0 flex-1 text-left"
              >
                <span className="block truncate text-sm font-medium">
                  {d.title}
                </span>
                <span className="block truncate text-xs text-slate-500">
                  {categoryLabel(d.category)} · {formatBytes(d.sizeBytes)}
                  {cached.has(d.id) ? ' · 📴 저장됨' : ' · 온라인 필요'}
                </span>
                {d.note && (
                  <span className="mt-0.5 block truncate text-xs text-sky-600 dark:text-sky-400">
                    {d.note}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!confirm(`"${d.title}"을 삭제할까요?`)) return
                  setError(null)
                  try {
                    await deleteDocument(d.id)
                    await refreshCached()
                  } catch (err) {
                    setError(
                      String(err).includes('offline')
                        ? '오프라인에서는 삭제할 수 없습니다.'
                        : String(err),
                    )
                  }
                }}
                className="shrink-0 text-xs text-slate-300 hover:text-rose-500"
                aria-label={`${d.title} 삭제`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <UploadForm
          onClose={() => setAdding(false)}
          onSubmit={async (title, category, file, note) => {
            setError(null)
            try {
              await addDocument({ tripId, title, category, file, note })
              await refreshCached()
              setMessage(`"${title || file.name}"을 올렸습니다.`)
              return true
            } catch (err) {
              setError(
                String(err).includes('offline')
                  ? '오프라인에서는 서류를 올릴 수 없습니다.'
                  : String(err).replace(/^Error:\s*/, ''),
              )
              return false
            }
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900"
        >
          + 서류 올리기
        </button>
      )}

      <p className="text-xs text-slate-400">
        서류는 비공개 저장소에 보관되며 이 여행에 참여한 사람만 볼 수 있습니다.
        파일당 {formatBytes(MAX_FILE_BYTES)}까지.
      </p>

      {viewing && (
        <Viewer doc={viewing} onClose={() => setViewing(null)} />
      )}
    </div>
  )
}

// ---------- 업로드 폼 ----------

function UploadForm({
  onSubmit,
  onClose,
}: {
  onSubmit: (
    title: string,
    category: DocumentCategory,
    file: File,
    note?: string,
  ) => Promise<boolean>
  onClose: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<DocumentCategory>('voucher')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-sky-500 p-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-slate-500">파일</span>
        <input
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null
            setFile(f)
            if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ''))
          }}
          className="text-sm"
        />
      </label>

      <div className="flex gap-2">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as DocumentCategory)}
          className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        >
          {DOCUMENT_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="제목"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-900"
        />
      </div>

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="비고 (선택) — 예: 예약번호 ABC123"
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-900"
      />

      {file && (
        <p className="text-xs text-slate-400">
          {file.name} · {formatBytes(file.size)}
          {file.size > MAX_FILE_BYTES && (
            <span className="ml-1 text-rose-500">— 너무 큽니다</span>
          )}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy || !file || file.size > MAX_FILE_BYTES}
          onClick={async () => {
            if (!file) return
            setBusy(true)
            try {
              const ok = await onSubmit(title, category, file, note)
              if (ok) {
                setFile(null)
                setTitle('')
                setNote('')
                onClose()
              }
            } finally {
              setBusy(false)
            }
          }}
          className="flex-1 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
        >
          {busy ? '올리는 중…' : '올리기'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-4 py-2.5 text-sm text-slate-500"
        >
          취소
        </button>
      </div>
    </div>
  )
}

// ---------- 뷰어 ----------

function Viewer({ doc, onClose }: { doc: TripDocument; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // 해제할 URL을 effect 밖에서도 알 수 있게 들고 있는다
  const urlRef = useRef<string | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const blob = await getDocumentBlob(doc.id)
        if (!alive) return
        const objectUrl = URL.createObjectURL(blob)
        urlRef.current = objectUrl
        setUrl(objectUrl)
      } catch (err) {
        if (!alive) return
        setError(
          String(err).includes('offline_not_cached')
            ? '이 서류는 이 기기에 저장되지 않았습니다. 연결된 뒤 열어주세요.'
            : String(err).replace(/^Error:\s*/, ''),
        )
      }
    })()
    return () => {
      alive = false
      // objectURL을 놔두면 탭이 살아 있는 동안 메모리를 계속 잡는다
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current)
        urlRef.current = null
      }
    }
  }, [doc.id])

  const isImage = doc.mimeType.startsWith('image/')
  const isPdf = doc.mimeType === 'application/pdf'

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-slate-950">
      <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <button type="button" onClick={onClose} className="text-sm text-slate-500">
          ← 닫기
        </button>
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{doc.title}</p>
        {url && (
          <a
            href={url}
            download={doc.fileName}
            className="shrink-0 text-xs text-sky-600 underline underline-offset-2 dark:text-sky-400"
          >
            내려받기
          </a>
        )}
      </header>

      <div className="flex-1 overflow-auto bg-slate-100 dark:bg-slate-900">
        {error ? (
          <p className="p-6 text-center text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        ) : !url ? (
          <p className="p-6 text-center text-sm text-slate-400">여는 중…</p>
        ) : isImage ? (
          <img
            src={url}
            alt={doc.title}
            className="mx-auto max-w-full"
          />
        ) : isPdf ? (
          // iframe은 오프라인에서도 blob URL을 그대로 읽는다
          <iframe src={url} title={doc.title} className="h-full w-full border-0" />
        ) : (
          <div className="flex flex-col items-center gap-3 p-8 text-sm">
            <p className="text-slate-500">
              이 형식은 앱 안에서 미리 볼 수 없습니다.
            </p>
            <a
              href={url}
              download={doc.fileName}
              className="rounded-lg bg-slate-900 px-4 py-2.5 font-medium text-white dark:bg-slate-100 dark:text-slate-900"
            >
              {doc.fileName} 내려받기
            </a>
          </div>
        )}
      </div>

      {doc.note && (
        <p className="border-t border-slate-200 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">
          {doc.note}
        </p>
      )}
    </div>
  )
}
