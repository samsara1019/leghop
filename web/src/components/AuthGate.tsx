import { useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '../lib/authContext'
import {
  clearMirror,
  findLocalOnlyTrips,
  mirrorTripList,
  uploadLocalTrips,
} from '../db/sync'
import { SignIn } from '../routes/SignIn'

type Phase =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'ask-upload'; trips: { id: string; title: string }[] }
  | { kind: 'uploading' }
  | { kind: 'done' }
  | { kind: 'offline' }

/**
 * 로그인 전에는 아무것도 보여주지 않는다.
 *
 * 로그인 직후에 로컬에만 있는 여행(계정 붙이기 전에 만든 것)이 있으면
 * 올릴지 물어본다. 안 물어보고 미러링하면 그 여행이 조용히 사라진다.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { ready, user } = useAuth()
  const userId = user?.id ?? null
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [syncedFor, setSyncedFor] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) {
      if (syncedFor !== null) {
        void clearMirror().then(() => {
          setSyncedFor(null)
          setPhase({ kind: 'idle' })
        })
      }
      return
    }
    if (syncedFor === userId) return

    let alive = true
    setPhase({ kind: 'checking' })

    void (async () => {
      try {
        // 계정이 바뀌었으면 이전 사용자의 사본을 먼저 치운다
        if (syncedFor !== null && syncedFor !== userId) {
          await clearMirror()
        }

        const localOnly = await findLocalOnlyTrips()
        if (!alive) return

        if (localOnly.length > 0) {
          setPhase({ kind: 'ask-upload', trips: localOnly })
          return
        }

        await mirrorTripList()
        if (!alive) return
        setSyncedFor(userId)
        setPhase({ kind: 'done' })
      } catch (err) {
        // 오프라인이면 서버를 못 읽는 게 정상 — 기존 미러로 계속 쓴다
        console.warn('동기화 실패, 로컬 사본을 사용합니다', err)
        if (!alive) return
        setSyncedFor(userId)
        setPhase({ kind: 'offline' })
      }
    })()

    return () => {
      alive = false
    }
  }, [userId, syncedFor])

  if (!ready) return <Splash>불러오는 중…</Splash>
  if (!user) return <SignIn />

  if (phase.kind === 'ask-upload') {
    return (
      <UploadPrompt
        trips={phase.trips}
        onUpload={async () => {
          setPhase({ kind: 'uploading' })
          const { failed } = await uploadLocalTrips(
            phase.trips.map((t) => t.id),
            user.id,
          )
          if (failed.length) {
            console.error('업로드 실패한 여행', failed)
          }
          await mirrorTripList()
          setSyncedFor(user.id)
          setPhase({ kind: 'done' })
        }}
        onSkip={async () => {
          setPhase({ kind: 'uploading' })
          await mirrorTripList()
          setSyncedFor(user.id)
          setPhase({ kind: 'done' })
        }}
      />
    )
  }

  if (phase.kind === 'checking' || phase.kind === 'uploading') {
    return (
      <Splash>
        {phase.kind === 'uploading' ? '올리는 중…' : '여행을 불러오는 중…'}
      </Splash>
    )
  }

  if (syncedFor === null) return <Splash>여행을 불러오는 중…</Splash>

  return <>{children}</>
}

function Splash({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center p-6 text-sm text-slate-400">
      {children}
    </div>
  )
}

function UploadPrompt({
  trips,
  onUpload,
  onSkip,
}: {
  trips: { id: string; title: string }[]
  onUpload: () => Promise<void>
  onSkip: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="text-lg font-semibold">이 기기에만 있는 여행이 있습니다</h1>
      <p className="text-sm text-slate-500">
        계정을 연결하기 전에 만든 여행입니다. 계정에 올리면 다른 기기에서도 보이고
        다른 사람과 공유할 수 있습니다.
      </p>
      <ul className="flex flex-col gap-1.5 rounded-xl border border-slate-200 p-3.5 text-sm dark:border-slate-800">
        {trips.map((t) => (
          <li key={t.id} className="truncate">
            · {t.title}
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          void onUpload()
        }}
        className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
      >
        {busy ? '처리 중…' : `${trips.length}개 계정에 올리기`}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (
            !confirm(
              '올리지 않으면 이 기기에서 지워집니다. 계속할까요?',
            )
          ) {
            return
          }
          setBusy(true)
          void onSkip()
        }}
        className="text-xs text-slate-400 underline underline-offset-2"
      >
        올리지 않고 지우기
      </button>
    </div>
  )
}
