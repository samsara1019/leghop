import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { hasSupabase } from '../lib/env'

interface Result {
  sessionUserId: string | null
  serverUid: string | null
  serverRole: string | null
  serverEmail: string | null
  error: string | null
}

/**
 * RLS 문제를 정책이 아니라 **인증**에서 먼저 배제하기 위한 진단.
 *
 * 42501은 "정책이 거부했다"와 "정책이 없다"를 구분해주지 않는다.
 * 서버가 보는 auth.uid()가 세션의 user.id와 같은지 확인하면
 * 적어도 인증 문제인지 정책 문제인지는 갈린다.
 */
export function SupabaseCheck() {
  const [result, setResult] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)

  const run = useCallback(async () => {
    if (!supabase) return
    setBusy(true)
    try {
      const { data: sess } = await supabase.auth.getSession()
      const sessionUserId = sess.session?.user.id ?? null

      const { data, error } = await supabase.rpc('whoami')
      const row = Array.isArray(data) ? data[0] : data

      setResult({
        sessionUserId,
        serverUid: row?.uid ?? null,
        serverRole: row?.role ?? null,
        serverEmail: row?.email ?? null,
        error: error
          ? `${error.message}${error.code ? ` (${error.code})` : ''}`
          : null,
      })
    } catch (err) {
      setResult({
        sessionUserId: null,
        serverUid: null,
        serverRole: null,
        serverEmail: null,
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void run()
  }, [run])

  if (!hasSupabase) {
    return (
      <Row label="Supabase" state="fail">
        VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 없음
      </Row>
    )
  }

  if (busy && !result) return <Row label="Supabase" state="pending">확인 중…</Row>

  const match =
    result?.sessionUserId !== null &&
    result?.sessionUserId === result?.serverUid

  return (
    <>
      <Row
        label="세션 사용자"
        state={result?.sessionUserId ? 'ok' : 'fail'}
      >
        {result?.sessionUserId ?? '로그인되지 않음'}
      </Row>
      <Row
        label="서버가 본 uid"
        state={result?.error ? 'fail' : result?.serverUid ? 'ok' : 'fail'}
      >
        {result?.error
          ? result.error
          : (result?.serverUid ??
            'null — 요청에 JWT가 실리지 않았습니다 (0003 미실행 시 whoami 함수가 없을 수 있음)')}
      </Row>
      <Row label="서버 role" state={result?.serverRole === 'authenticated' ? 'ok' : 'warn'}>
        {result?.serverRole ?? '알 수 없음'}
      </Row>
      <Row label="신원 일치" state={match ? 'ok' : 'fail'}>
        {match
          ? '세션과 서버가 같은 사용자로 봅니다 → 인증은 정상, 문제가 있다면 RLS 정책 쪽'
          : '불일치 — RLS보다 인증 설정을 먼저 확인해야 합니다'}
      </Row>
      <div className="pl-8">
        <button
          type="button"
          onClick={() => void run()}
          className="text-xs text-slate-400 underline underline-offset-2"
        >
          다시 확인
        </button>
      </div>
    </>
  )
}

type State = 'ok' | 'warn' | 'fail' | 'pending'

const DOT: Record<State, string> = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  fail: 'bg-rose-500',
  pending: 'bg-slate-400 animate-pulse',
}

function Row({
  label,
  state,
  children,
}: {
  label: string
  state: State
  children: ReactNode
}) {
  return (
    <li className="flex items-start gap-3 text-sm">
      <span className={`mt-1.5 size-2 shrink-0 rounded-full ${DOT[state]}`} aria-hidden />
      <span className="w-32 shrink-0 font-medium">{label}</span>
      <span className="break-all text-slate-500 dark:text-slate-400">{children}</span>
    </li>
  )
}
