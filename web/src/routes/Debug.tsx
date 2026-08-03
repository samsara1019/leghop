import { useEffect, useState } from 'react'
import { MapPanel } from '../components/MapPanel'
import { SupabaseCheck } from '../components/SupabaseCheck'
import { db } from '../db/schema'
import {
  GOOGLE_MAPS_MAP_ID,
  PARSER_URL,
  hasMapsKey,
  hasParser,
} from '../lib/env'

type CheckState = 'ok' | 'warn' | 'fail' | 'pending'

interface Check {
  label: string
  state: CheckState
  detail: string
}

const DOT: Record<CheckState, string> = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  fail: 'bg-rose-500',
  pending: 'bg-slate-400 animate-pulse',
}

export function Debug() {
  const [dbCheck, setDbCheck] = useState<Check>({
    label: 'IndexedDB',
    state: 'pending',
    detail: '확인 중…',
  })
  const [persisted, setPersisted] = useState<Check>({
    label: '저장소 영속화',
    state: 'pending',
    detail: '확인 중…',
  })

  useEffect(() => {
    let alive = true

    void (async () => {
      // Dexie 스키마가 실제로 열리는지, 테이블이 다 잡혔는지 확인
      try {
        await db.open()
        const tables = db.tables.map((t) => t.name).join(', ')
        if (alive) {
          setDbCheck({
            label: 'IndexedDB',
            state: 'ok',
            detail: `leghop v${db.verno} — ${tables}`,
          })
        }
      } catch (err) {
        if (alive) {
          setDbCheck({
            label: 'IndexedDB',
            state: 'fail',
            detail: err instanceof Error ? err.message : String(err),
          })
        }
      }

      // iOS Safari가 미사용 기간 후 IndexedDB를 지우는 걸 막는다 (DESIGN.md §5)
      try {
        if (navigator.storage?.persist) {
          const already = await navigator.storage.persisted()
          const granted = already || (await navigator.storage.persist())
          if (alive) {
            setPersisted({
              label: '저장소 영속화',
              state: granted ? 'ok' : 'warn',
              detail: granted
                ? '브라우저가 자동 삭제하지 않음'
                : '거부됨 — 홈 화면에 설치하면 승격될 수 있음',
            })
          }
        } else if (alive) {
          setPersisted({
            label: '저장소 영속화',
            state: 'warn',
            detail: '이 브라우저는 persist()를 지원하지 않음',
          })
        }
      } catch {
        if (alive) {
          setPersisted({
            label: '저장소 영속화',
            state: 'warn',
            detail: '확인 실패',
          })
        }
      }
    })()

    return () => {
      alive = false
    }
  }, [])

  const checks: Check[] = [
    {
      label: 'Google Maps 키',
      state: hasMapsKey ? 'ok' : 'fail',
      detail: hasMapsKey
        ? 'VITE_GOOGLE_MAPS_API_KEY 로드됨'
        : '.env.local 에 VITE_GOOGLE_MAPS_API_KEY 필요',
    },
    {
      label: 'Map ID',
      state: GOOGLE_MAPS_MAP_ID ? 'ok' : 'warn',
      detail: GOOGLE_MAPS_MAP_ID
        ? GOOGLE_MAPS_MAP_ID
        : '없음 — Advanced Marker 비활성 (P1에서 필요)',
    },
    {
      label: 'Gemini 프록시',
      state: hasParser ? 'ok' : PARSER_URL ? 'fail' : 'warn',
      detail: hasParser
        ? PARSER_URL
        : PARSER_URL
          ? 'VITE_PARSER_URL이 URL이 아닙니다. 프록시 주소(예: http://localhost:8787)를 넣어야 하며, Gemini 키는 proxy/.env.local에 둡니다'
          : '없음 — 텍스트 파서(P3)만 비활성',
    },
    dbCheck,
    persisted,
  ]

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col gap-6 p-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Leghop</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          P0 · 환경 점검
        </p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 text-sm font-medium text-slate-500 dark:text-slate-400">
          Supabase 인증
        </h2>
        <ul className="flex flex-col gap-2.5">
          <SupabaseCheck />
        </ul>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 text-sm font-medium text-slate-500 dark:text-slate-400">
          구성 상태
        </h2>
        <ul className="flex flex-col gap-2.5">
          {checks.map((c) => (
            <li key={c.label} className="flex items-start gap-3 text-sm">
              <span
                className={`mt-1.5 size-2 shrink-0 rounded-full ${DOT[c.state]}`}
                aria-hidden
              />
              <span className="w-32 shrink-0 font-medium">{c.label}</span>
              <span className="break-all text-slate-500 dark:text-slate-400">
                {c.detail}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400">
          지도
        </h2>
        {hasMapsKey ? <MapPanel /> : <SetupGuide />}
      </section>
    </div>
  )
}

function SetupGuide() {
  return (
    <div className="flex flex-col gap-4 p-6 text-sm">
      <p className="font-medium">
        Google Maps 키가 없어 지도를 띄울 수 없습니다.
      </p>
      <ol className="flex list-decimal flex-col gap-2 pl-5 text-slate-600 dark:text-slate-400">
        <li>
          <a
            className="underline underline-offset-2"
            href="https://console.cloud.google.com/google/maps-apis/api-list"
            target="_blank"
            rel="noreferrer"
          >
            Google Cloud 콘솔
          </a>
          에서 <strong>Maps JavaScript API</strong>, <strong>Places API (New)</strong>,{' '}
          <strong>Directions API</strong> 를 활성화
        </li>
        <li>
          API 키를 발급하고 <strong>HTTP 리퍼러 제한</strong>을{' '}
          <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">
            localhost:5173/*
          </code>{' '}
          로 설정
        </li>
        <li>
          <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">
            web/.env.local
          </code>{' '}
          을 만들고{' '}
          <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">
            VITE_GOOGLE_MAPS_API_KEY=...
          </code>
        </li>
        <li>dev 서버 재시작</li>
      </ol>
      <p className="text-slate-500 dark:text-slate-500">
        자세한 절차는 저장소 루트의 <code>README.md</code> 참고.
      </p>
    </div>
  )
}
