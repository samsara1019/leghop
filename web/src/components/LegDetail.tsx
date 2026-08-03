import { useState } from 'react'
import { useMapsLibrary } from '@vis.gl/react-google-maps'
import type { Leg, Place } from '../db/schema'
import { saveLegOption, selectLegMode } from '../db/plannerRepo'
import { ALL_MODES, MODE_EMOJI, MODE_LABEL, fetchRoute } from '../lib/directions'
import { formatDistance, formatDuration } from '../lib/schedule'
import { RouteMap } from './RouteMap'

interface Props {
  leg: Leg
  from: Place
  to: Place
  departAt?: Date
  onClose: () => void
}

export function LegDetail({ leg, from, to, departAt, onClose }: Props) {
  const routesLib = useMapsLibrary('routes')
  const [comparing, setComparing] = useState(false)
  const selected =
    leg.alternatives.find((a) => a.mode === leg.selectedMode) ?? leg.alternatives[0]

  const missing = ALL_MODES.filter(
    (m) => !leg.alternatives.some((a) => a.mode === m),
  )

  /**
   * 대안 수단은 여기서만 부른다. 자동 계산이 주 수단 하나만 부르는 이유가
   * 비용이라, 비교는 명시적 행동으로 남겨둔다 (DESIGN.md §7.2).
   */
  async function compareAll() {
    if (!routesLib || missing.length === 0) return
    setComparing(true)
    const service = new routesLib.DirectionsService()
    try {
      for (const mode of missing) {
        const option = await fetchRoute(service, {
          from: { lat: from.lat, lng: from.lng },
          to: { lat: to.lat, lng: to.lng },
          mode,
          departAt,
        })
        if (option) await saveLegOption(leg.id, option, false)
      }
    } finally {
      setComparing(false)
    }
  }

  const sorted = [...leg.alternatives].sort((a, b) => a.durationS - b.durationS)

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-slate-950">
      <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-slate-500"
          aria-label="닫기"
        >
          ← 닫기
        </button>
        <p className="min-w-0 flex-1 truncate text-sm font-medium">
          {from.name} → {to.name}
        </p>
      </header>

      <div className="flex-1 overflow-y-auto">
        {selected ? (
          <>
            <RouteMap
              encodedPolyline={selected.polyline}
              from={{ lat: from.lat, lng: from.lng }}
              to={{ lat: to.lat, lng: to.lng }}
              height={260}
            />

            <div className="flex flex-col gap-4 p-4">
              <section>
                <div className="flex items-baseline gap-2">
                  <span className="text-lg">{MODE_EMOJI[selected.mode]}</span>
                  <span className="text-lg font-semibold">
                    {formatDuration(selected.durationS)}
                  </span>
                  <span className="text-sm text-slate-500">
                    {formatDistance(selected.distanceM)}
                  </span>
                  {selected.fareText && (
                    <span className="text-sm text-emerald-600 dark:text-emerald-400">
                      {selected.fareText}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-slate-500">{selected.label}</p>
              </section>

              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-medium text-slate-500">수단 비교</h3>
                  {missing.length > 0 && (
                    <button
                      type="button"
                      onClick={() => void compareAll()}
                      disabled={comparing || !routesLib}
                      className="text-xs text-sky-600 underline underline-offset-2 disabled:opacity-50 dark:text-sky-400"
                    >
                      {comparing
                        ? '조회 중…'
                        : `다른 수단 ${missing.length}개 조회`}
                    </button>
                  )}
                </div>
                <ul className="flex flex-col gap-1.5">
                  {sorted.map((opt) => (
                    <li key={opt.mode}>
                      <button
                        type="button"
                        onClick={() => void selectLegMode(leg.id, opt.mode)}
                        className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm ${
                          opt.mode === leg.selectedMode
                            ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/40'
                            : 'border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        <span>{MODE_EMOJI[opt.mode]}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{opt.label}</span>
                          <span className="block text-xs text-slate-500">
                            {MODE_LABEL[opt.mode]} · {formatDistance(opt.distanceM)}
                            {opt.fareText ? ` · ${opt.fareText}` : ''}
                          </span>
                        </span>
                        <span className="shrink-0 font-medium">
                          {formatDuration(opt.durationS)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                {missing.length > 0 && !comparing && (
                  <p className="mt-2 text-xs text-slate-400">
                    조회하지 않은 수단: {missing.map((m) => MODE_LABEL[m]).join(', ')}
                  </p>
                )}
              </section>

              <section>
                <h3 className="mb-2 text-sm font-medium text-slate-500">
                  상세 경로
                </h3>
                <ol className="flex flex-col gap-2.5">
                  {selected.steps.map((s, i) => (
                    <li key={i} className="flex gap-3 text-sm">
                      <span className="w-5 shrink-0 text-right text-xs text-slate-400">
                        {i + 1}
                      </span>
                      <span className="flex-1">
                        {s.text || '(안내 없음)'}
                        <span className="ml-1.5 text-xs text-slate-400">
                          {formatDistance(s.distanceM)} ·{' '}
                          {formatDuration(s.durationS)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            </div>
          </>
        ) : (
          <p className="p-6 text-center text-sm text-slate-500">
            아직 경로를 계산하지 못했습니다.
          </p>
        )}
      </div>
    </div>
  )
}
