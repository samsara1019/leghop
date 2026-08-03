import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'
import {
  cancelInvite,
  fetchMembers,
  inviteMember,
  removeMember,
  type MemberRow,
} from '../db/remote'
import { useAuth } from '../lib/authContext'

export function Share() {
  const { tripId = '' } = useParams()
  const { user } = useAuth()
  const trip = useLiveQuery(() => db.trips.get(tripId), [tripId])

  const [members, setMembers] = useState<MemberRow[] | null>(null)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setMembers(await fetchMembers(tripId))
      setError(null)
    } catch (err) {
      setError(readableError(err))
    }
  }, [tripId])

  useEffect(() => {
    void load()
  }, [load])

  const isOwner = members?.some(
    (m) => m.role === 'owner' && m.userId === user?.id,
  )
  const count = members?.length ?? 0

  async function invite() {
    setBusy(true)
    setMessage(null)
    setError(null)
    try {
      const result = await inviteMember(tripId, email.trim())
      setEmail('')
      setMessage(
        result === 'added'
          ? '추가했습니다. 상대가 로그인하면 이 여행이 보입니다.'
          : result === 'invited'
            ? '초대해 뒀습니다. 상대가 같은 이메일로 가입하면 자동으로 참여됩니다.'
            : '이미 참여 중인 사람입니다.',
      )
      await load()
    } catch (err) {
      setError(readableError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-5">
      <header>
        <Link to={`/trip/${tripId}`} className="text-xs text-slate-400">
          ← 장소 서랍
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">함께 편집</h1>
        <p className="text-sm text-slate-500">{trip?.title ?? ''}</p>
      </header>

      <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        초대한 사람은 이 여행을 <strong>함께 수정</strong>할 수 있습니다. 여행 삭제는
        소유자만 할 수 있습니다.
      </p>

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

      {members === null ? (
        <p className="text-sm text-slate-400">불러오는 중…</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {members.map((m) => (
            <li
              key={m.userId ?? `invite:${m.email}`}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900"
            >
              {m.avatarUrl ? (
                <img
                  src={m.avatarUrl}
                  alt=""
                  className="size-8 shrink-0 rounded-full"
                />
              ) : (
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs dark:bg-slate-700">
                  {(m.displayName ?? m.email ?? '?').slice(0, 1).toUpperCase()}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {m.displayName ?? m.email ?? '(알 수 없음)'}
                  {m.userId === user?.id && (
                    <span className="ml-1.5 text-xs text-slate-400">나</span>
                  )}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {m.role === 'owner' ? '소유자' : '편집자'}
                  {m.isPending ? ' · 가입 대기 중' : ''}
                  {m.email && !m.isPending ? ` · ${m.email}` : ''}
                </p>
              </div>

              {isOwner && m.role !== 'owner' && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      if (m.isPending && m.email) await cancelInvite(tripId, m.email)
                      else if (m.userId) await removeMember(tripId, m.userId)
                      await load()
                    } catch (err) {
                      setError(readableError(err))
                    }
                  }}
                  className="shrink-0 text-xs text-slate-400 hover:text-rose-500"
                >
                  {m.isPending ? '초대 취소' : '내보내기'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {isOwner && (
        <div className="flex flex-col gap-2 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-slate-500">
              이메일로 초대
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="friend@example.com"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-900"
            />
          </label>
          <p className="text-xs text-slate-400">
            아직 가입하지 않은 사람도 초대할 수 있습니다. 같은 이메일로 가입하는
            순간 자동으로 참여됩니다.
          </p>
          <button
            type="button"
            disabled={busy || !email.includes('@')}
            onClick={() => void invite()}
            className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
          >
            {busy ? '처리 중…' : '초대'}
          </button>
        </div>
      )}

      {!isOwner && members !== null && (
        <p className="text-xs text-slate-400">
          공유받은 여행입니다. 초대와 내보내기는 소유자만 할 수 있습니다.
        </p>
      )}

      {count > 0 && (
        <p className="text-center text-xs text-slate-400">
          현재 {count}명 참여 중
        </p>
      )}
    </div>
  )
}

/** Postgres 예외 메시지를 사람이 읽을 수 있게 바꾼다 */
function readableError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  if (raw.includes('member_limit_reached')) {
    return '참여 인원이 가득 찼습니다. 한 명을 내보낸 뒤 다시 초대하세요.'
  }
  if (raw.includes('not_owner')) return '소유자만 초대할 수 있습니다.'
  if (raw.includes('not_member')) return '이 여행에 접근할 권한이 없습니다.'
  if (raw.includes('invalid_email')) return '이메일 형식을 확인하세요.'
  if (raw.includes('Failed to fetch')) {
    return '네트워크에 연결되지 않아 참여자 정보를 불러올 수 없습니다.'
  }
  return raw
}
