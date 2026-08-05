import { useState } from 'react'
import { useAuth } from '../lib/authContext'
import { hasSupabase } from '../lib/env'

export function SignIn() {
  const { signInWithGoogle } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-6 p-6">
      <div className="text-center">
        <svg viewBox="0 0 100 100" className="mx-auto size-16" aria-hidden>
          <rect x="5.5" y="5.5" width="89" height="89" rx="22" fill="#0f172a" />
          <g fill="none" stroke="#38bdf8" strokeWidth="4.2" strokeLinecap="round">
            <path d="M19 55.4 A15.5 15.5 0 0 1 50 55.4" />
            <path d="M50 55.4 A15.5 15.5 0 0 1 81 55.4" />
          </g>
          <circle cx="19" cy="55.4" r="6.8" fill="#f8fafc" />
          <circle cx="50" cy="55.4" r="6.8" fill="#f8fafc" />
          <circle cx="81" cy="55.4" r="6.8" fill="#34d399" />
        </svg>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Leghop</h1>
        <p className="mt-1 text-sm text-slate-500">
          여행 동선·코스와 준비물을 한 번에
        </p>
      </div>

      {/* 로그인 전 화면이 곧 소개 페이지다. 검색으로 들어온 사람이
          무엇을 하는 도구인지 알 수 있어야 한다. */}
      <ul className="flex flex-col gap-3 text-sm">
        <li className="flex gap-3">
          <span aria-hidden>🗺️</span>
          <span>
            <strong>동선이 자동으로 계산됩니다.</strong>
            <span className="block text-slate-500">
              가고 싶은 곳을 모아 순서만 배치하면 구간별 이동 시간과 경로가
              붙습니다. 공항버스와 택시를 나란히 비교할 수 있습니다.
            </span>
          </span>
        </li>
        <li className="flex gap-3">
          <span aria-hidden>🧳</span>
          <span>
            <strong>준비물이 여행지에 맞춰 달라집니다.</strong>
            <span className="block text-slate-500">
              유럽이면 석회수 대비 샤워 필터와 C타입 어댑터, 여름이면 양산이
              붙습니다. 체크한 것은 함께 가는 사람과 공유됩니다.
            </span>
          </span>
        </li>
        <li className="flex gap-3">
          <span aria-hidden>📄</span>
          <span>
            <strong>바우처가 오프라인에서 열립니다.</strong>
            <span className="block text-slate-500">
              항공권·예약 확인서를 올려두면 데이터가 안 터지는 공항에서도
              꺼내볼 수 있습니다.
            </span>
          </span>
        </li>
      </ul>

      {!hasSupabase ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950/40">
          <p className="font-medium text-amber-900 dark:text-amber-200">
            Supabase가 설정되지 않았습니다.
          </p>
          <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5 text-amber-900/80 dark:text-amber-200/80">
            <li>
              <a
                className="underline"
                href="https://supabase.com/dashboard"
                target="_blank"
                rel="noreferrer"
              >
                Supabase 콘솔
              </a>
              에서 프로젝트 생성
            </li>
            <li>
              SQL Editor에 <code>supabase/migrations/0001_init.sql</code> 실행
            </li>
            <li>Authentication → Providers에서 Google 활성화</li>
            <li>
              <code>web/.env</code>에 <code>VITE_SUPABASE_URL</code>,{' '}
              <code>VITE_SUPABASE_ANON_KEY</code> 추가
            </li>
          </ol>
          <p className="mt-2 text-xs text-amber-900/70 dark:text-amber-200/70">
            자세한 절차는 README 참고.
          </p>
        </div>
      ) : (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              setError(null)
              try {
                await signInWithGoogle()
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err))
                setBusy(false)
              }
            }}
            className="flex items-center justify-center gap-2.5 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 disabled:opacity-50 dark:border-slate-700"
          >
            <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
              <path
                fill="#4285F4"
                d="M45.1 24.5c0-1.6-.1-2.8-.4-4H24v7.6h11.9c-.2 2-1.5 5-4.4 7l6.7 5.2c4-3.7 6.9-9.1 6.9-15.8z"
              />
              <path
                fill="#34A853"
                d="M24 46c5.9 0 10.8-1.9 14.2-5.3l-6.7-5.2c-1.8 1.3-4.3 2.2-7.5 2.2-5.8 0-10.7-3.8-12.4-9.1l-7 5.4C8 41.2 15.4 46 24 46z"
              />
              <path
                fill="#FBBC05"
                d="M11.6 28.6c-.5-1.3-.7-2.7-.7-4.1s.3-2.8.7-4.1l-7-5.4C3.6 17.8 3 20.8 3 24s.6 6.2 1.6 9l7-4.4z"
              />
              <path
                fill="#EA4335"
                d="M24 10.8c3.3 0 6.2 1.1 8.5 3.3l6-6C34.7 4.7 29.9 2.5 24 2.5 15.4 2.5 8 7.3 4.6 15l7 5.4c1.7-5.3 6.6-9.6 12.4-9.6z"
              />
            </svg>
            {busy ? '이동 중…' : 'Google로 계속하기'}
          </button>

          <p className="text-center text-xs text-slate-400">
            여행은 최대 2명까지 함께 편집할 수 있습니다.
          </p>
          <p className="text-center text-xs text-slate-400">
            계속하면{' '}
            <a
              href="/privacy"
              className="underline underline-offset-2"
            >
              개인정보처리방침
            </a>
            에 동의하는 것으로 봅니다.
          </p>
        </>
      )}

      {error && (
        <p className="rounded-lg bg-rose-100 px-3 py-2 text-sm text-rose-900 dark:bg-rose-950 dark:text-rose-200">
          로그인 실패: {error}
        </p>
      )}

      <nav className="border-t border-slate-200 pt-4 text-xs dark:border-slate-800">
        <p className="mb-1.5 text-slate-400">로그인 없이 볼 수 있는 가이드</p>
        <ul className="flex flex-col gap-1">
          <li>
            <a
              href="/guide/europe-packing"
              className="text-sky-600 underline underline-offset-2 dark:text-sky-400"
            >
              유럽여행 준비물 체크리스트
            </a>
          </li>
          <li>
            <a
              href="/guide/barcelona-packing"
              className="text-sky-600 underline underline-offset-2 dark:text-sky-400"
            >
              바르셀로나 여행 준비물
            </a>
          </li>
          <li>
            <a
              href="/guide/travel-course"
              className="text-sky-600 underline underline-offset-2 dark:text-sky-400"
            >
              여행 코스·동선 짜는 법
            </a>
          </li>
        </ul>
      </nav>
    </div>
  )
}
