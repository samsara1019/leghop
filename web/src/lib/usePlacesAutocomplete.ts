import { useCallback, useEffect, useRef, useState } from 'react'
import { useMapsLibrary } from '@vis.gl/react-google-maps'

/**
 * 신규 Places API(AutocompleteSuggestion) 래퍼.
 *
 * 비용 방어 (DESIGN.md §7.2):
 * - 세션 토큰을 써서 "자동완성 여러 번 + 상세 1번"이 한 세션으로 묶이게 한다.
 *   토큰 없이 부르면 자동완성 키 입력 하나하나가 개별 과금된다.
 * - 디바운스 400ms, 최소 글자수 제한.
 */

const DEBOUNCE_MS = 400
/** 설계서는 3글자였지만 한국어는 2글자로도 의미가 선다("성당", "공항") */
const MIN_QUERY = 2
/** 검색 지역 편향 반경 */
const BIAS_RADIUS_M = 30_000

export interface Suggestion {
  placeId: string
  main: string
  secondary: string
  types: string[]
  /** 상세 조회 시 세션 토큰을 자동으로 물고 가므로 예측 객체를 그대로 들고 있는다 */
  prediction: google.maps.places.PlacePrediction
}

export interface ResolvedPlace {
  googlePlaceId: string
  name: string
  address: string
  lat: number
  lng: number
  types: string[]
  openingHours?: string[]
  priceLevel?: string
}

export function usePlacesAutocomplete(bias?: { lat: number; lng: number }) {
  const placesLib = useMapsLibrary('places')
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null)
  const biasLat = bias?.lat
  const biasLng = bias?.lng

  useEffect(() => {
    if (!placesLib) return
    const q = query.trim()
    if (q.length < MIN_QUERY) {
      setSuggestions([])
      setError(null)
      return
    }

    let cancelled = false
    const timer = setTimeout(async () => {
      if (!tokenRef.current) {
        tokenRef.current = new placesLib.AutocompleteSessionToken()
      }
      setLoading(true)
      setError(null)
      try {
        const { suggestions: raw } =
          await placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: q,
            sessionToken: tokenRef.current,
            language: 'ko',
            ...(biasLat !== undefined && biasLng !== undefined
              ? {
                  locationBias: {
                    center: { lat: biasLat, lng: biasLng },
                    radius: BIAS_RADIUS_M,
                  },
                }
              : {}),
          })

        if (cancelled) return
        setSuggestions(
          raw
            .map((s) => s.placePrediction)
            .filter((p): p is google.maps.places.PlacePrediction => p !== null)
            .map((p) => ({
              placeId: p.placeId,
              main: p.mainText?.text ?? p.text.text,
              secondary: p.secondaryText?.text ?? '',
              types: p.types ?? [],
              prediction: p,
            })),
        )
      } catch (err) {
        if (!cancelled) {
          setSuggestions([])
          setError(err instanceof Error ? err.message : String(err))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, placesLib, biasLat, biasLng])

  /** 선택된 후보의 상세를 가져온다. 이 호출로 세션이 끝나므로 토큰을 버린다. */
  const resolve = useCallback(
    async (suggestion: Suggestion): Promise<ResolvedPlace> => {
      const place = suggestion.prediction.toPlace()
      await place.fetchFields({
        fields: [
          'id',
          'displayName',
          'formattedAddress',
          'location',
          'types',
          'regularOpeningHours',
          'priceLevel',
        ],
      })
      tokenRef.current = null

      const loc = place.location
      return {
        googlePlaceId: place.id,
        name: place.displayName ?? suggestion.main,
        address: place.formattedAddress ?? suggestion.secondary,
        lat: loc?.lat() ?? 0,
        lng: loc?.lng() ?? 0,
        types: place.types ?? suggestion.types,
        openingHours: place.regularOpeningHours?.weekdayDescriptions ?? undefined,
        priceLevel: place.priceLevel ?? undefined,
      }
    },
    [],
  )

  const reset = useCallback(() => {
    setQuery('')
    setSuggestions([])
    setError(null)
  }, [])

  return {
    ready: Boolean(placesLib),
    query,
    setQuery,
    suggestions,
    loading,
    error,
    resolve,
    reset,
  }
}
