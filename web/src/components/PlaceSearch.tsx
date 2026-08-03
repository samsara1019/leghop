import { useState } from 'react'
import {
  usePlacesAutocomplete,
  type ResolvedPlace,
  type Suggestion,
} from '../lib/usePlacesAutocomplete'
import { CATEGORIES, inferCategory } from '../lib/categories'

interface Props {
  bias?: { lat: number; lng: number }
  placeholder?: string
  onSelect: (place: ResolvedPlace) => void | Promise<void>
}

export function PlaceSearch({ bias, placeholder = '장소 검색', onSelect }: Props) {
  const { ready, query, setQuery, suggestions, loading, error, resolve, reset } =
    usePlacesAutocomplete(bias)
  const [resolving, setResolving] = useState<string | null>(null)

  async function handlePick(s: Suggestion) {
    setResolving(s.placeId)
    try {
      const place = await resolve(s)
      await onSelect(place)
      reset()
    } catch (err) {
      console.error('장소 상세 조회 실패', err)
    } finally {
      setResolving(null)
    }
  }

  return (
    <div className="relative">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={ready ? placeholder : '지도 API 로딩 중…'}
        disabled={!ready}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none placeholder:text-slate-400 focus:border-sky-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900"
      />

      {loading && (
        <span className="absolute right-3 top-3 text-xs text-slate-400">검색 중…</span>
      )}

      {error && (
        <p className="mt-1.5 text-xs text-rose-500">검색 실패: {error}</p>
      )}

      {suggestions.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {suggestions.map((s) => {
            const cat = CATEGORIES[inferCategory(s.types)]
            return (
              <li key={s.placeId}>
                <button
                  type="button"
                  onClick={() => void handlePick(s)}
                  disabled={resolving !== null}
                  className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-slate-50 disabled:opacity-50 dark:hover:bg-slate-800"
                >
                  <span aria-hidden>{cat.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{s.main}</span>
                    {s.secondary && (
                      <span className="block truncate text-xs text-slate-500">
                        {s.secondary}
                      </span>
                    )}
                  </span>
                  {resolving === s.placeId && (
                    <span className="text-xs text-slate-400">추가 중…</span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
