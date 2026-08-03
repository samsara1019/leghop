import { WORKER_URL, hasWorker } from './env'
import { inferCategory } from './categories'
import { stripLinePrefix, type ColumnRole, type TableData } from './pasteParse'
import type { PlaceCategory, TravelMode } from '../db/schema'

export type DraftKind = 'stop' | 'activity' | 'transfer'

export interface PlaceCandidate {
  googlePlaceId: string
  name: string
  address: string
  lat: number
  lng: number
  types: string[]
}

export type DraftStatus =
  | 'pending'
  | 'searching'
  | 'matched'
  | 'nomatch'
  | 'manual'
  | 'skipped'

export interface Draft {
  id: string
  kind: DraftKind
  /** stop: 검색어 */
  query?: string
  /** activity: 활동명 */
  title?: string
  note?: string
  durationMin?: number
  startAt?: string
  modeHints?: TravelMode[]
  /** 사용자가 분류를 직접 지정한 경우 */
  category?: PlaceCategory
  candidates: PlaceCandidate[]
  chosenIndex: number | null
  status: DraftStatus
}

let seq = 0
const nextId = () => `d${++seq}`

// ---------- 표 → Draft ----------

const CATEGORY_WORDS: [PlaceCategory, string[]][] = [
  ['lodging', ['숙소', '호텔', '숙박', '게하', '에어비앤비', 'hotel']],
  ['food', ['맛집', '식당', '음식', '카페', '레스토랑', 'food', 'cafe']],
  ['sight', ['관광', '명소', '박물관', '미술관', '공원', '성당', 'sight']],
  ['shop', ['쇼핑', '상점', '시장', '백화점', 'shop']],
  ['transport', ['교통', '공항', '역', '터미널', 'airport', 'station']],
]

function categoryFromWord(v?: string): PlaceCategory | undefined {
  if (!v) return undefined
  const lower = v.toLowerCase()
  for (const [cat, words] of CATEGORY_WORDS) {
    if (words.some((w) => lower.includes(w))) return cat
  }
  return undefined
}

export function draftsFromTable(table: TableData, roles: ColumnRole[]): Draft[] {
  const col = (row: string[], role: ColumnRole): string | undefined => {
    const i = roles.indexOf(role)
    return i >= 0 ? row[i]?.trim() || undefined : undefined
  }

  return table.rows
    .map((row): Draft | null => {
      const name = col(row, 'name')
      if (!name) return null
      const durationRaw = col(row, 'durationMin')
      const duration = durationRaw ? parseInt(durationRaw.replace(/\D/g, ''), 10) : NaN
      return {
        id: nextId(),
        kind: 'stop',
        query: name,
        note: col(row, 'note'),
        durationMin: Number.isFinite(duration) ? duration : undefined,
        startAt: col(row, 'startAt'),
        category: categoryFromWord(col(row, 'category')),
        candidates: [],
        chosenIndex: null,
        status: 'pending',
      }
    })
    .filter((d): d is Draft => d !== null)
}

// ---------- 산문 → Draft ----------

const ACTIVITY_WORDS = [
  '입국', '출국', '심사', '짐', '수하물', '체크인', '체크아웃',
  '휴식', '대기', '탑승', '환전', '자유시간', '취침', '기상',
]
const TRANSFER_WORDS: [TravelMode, string[]][] = [
  ['transit', ['버스', '지하철', '전철', '기차', '트램', '메트로', '대중교통', 'aerobus']],
  ['driving', ['택시', '렌터카', '차로', '자동차', 'uber', '우버']],
  ['walking', ['도보', '걸어', '산책']],
  ['bicycling', ['자전거']],
]
const TRANSFER_HINT = ['이동', '가기', '타고']

const DURATION_GUESS: [string[], number][] = [
  [['입국', '심사', '짐', '수하물'], 80],
  [['체크인', '체크아웃'], 30],
  [['식사', '점심', '저녁', '아침', '먹기'], 90],
  [['박물관', '미술관', '성당'], 120],
]

/**
 * "라 플라우타 에서 꿀대구 먹기" → 장소 "라 플라우타", 메모 "꿀대구 먹기"
 *
 * 조사 뒤를 그대로 검색어에 넣으면 Places가 엉뚱한 걸 찾는다.
 * Gemini는 이걸 알아서 하지만 규칙 기반에서는 명시적으로 잘라야 한다.
 */
const PLACE_TAIL = /^(.+?)\s*(?:에서|에 가서|으로 가서|로 가서|에 들러)\s+(.+)$/

function splitPlaceAndNote(text: string): { query: string; note?: string } {
  const m = PLACE_TAIL.exec(text)
  if (!m) return { query: text }
  const [, place, rest] = m
  // 장소 쪽이 너무 짧으면 잘못 자른 것으로 보고 원문을 쓴다
  if (place.trim().length < 2) return { query: text }
  return { query: place.trim(), note: rest.trim() }
}

function guessDuration(text: string): number | undefined {
  const explicit = /(\d+)\s*(시간|분)/.exec(text)
  if (explicit) {
    const n = Number(explicit[1])
    return explicit[2] === '시간' ? n * 60 : n
  }
  for (const [words, min] of DURATION_GUESS) {
    if (words.some((w) => text.includes(w))) return min
  }
  return undefined
}

/**
 * Worker(Gemini) 없이도 쓸 수 있는 규칙 기반 파서.
 *
 * Gemini가 훨씬 잘하지만, 키가 없으면 기능이 아예 죽는 것보다는
 * 줄 단위로라도 뽑아주는 게 낫다. 결과는 어차피 사용자가 확인한다.
 */
export function draftsFromProseLocal(lines: string[]): Draft[] {
  return lines
    .map((line): Draft | null => {
      const { text, startAt } = stripLinePrefix(line)
      if (!text) return null

      const modes = TRANSFER_WORDS.filter(([, words]) =>
        words.some((w) => text.toLowerCase().includes(w)),
      ).map(([mode]) => mode)
      const looksTransfer =
        modes.length > 0 && TRANSFER_HINT.some((w) => text.includes(w))

      if (looksTransfer) {
        return {
          id: nextId(),
          kind: 'transfer',
          note: text,
          modeHints: modes,
          candidates: [],
          chosenIndex: null,
          status: 'manual',
        }
      }

      if (ACTIVITY_WORDS.some((w) => text.includes(w))) {
        return {
          id: nextId(),
          kind: 'activity',
          title: text,
          startAt,
          durationMin: guessDuration(text) ?? 60,
          candidates: [],
          chosenIndex: null,
          status: 'manual',
        }
      }

      const { query, note } = splitPlaceAndNote(text)
      return {
        id: nextId(),
        kind: 'stop',
        query,
        note,
        startAt,
        // 소요시간 추정은 잘라내기 전 원문으로 한다 ("먹기"가 메모 쪽에 남기 때문)
        durationMin: guessDuration(text),
        candidates: [],
        chosenIndex: null,
        status: 'pending',
      }
    })
    .filter((d): d is Draft => d !== null)
}

interface WorkerItem {
  kind?: string
  query?: string
  title?: string
  modeHints?: string[]
  startAt?: string
  durationMin?: number
  note?: string
}

/** Worker 경유 Gemini 파싱. 실패하면 호출부가 규칙 기반으로 넘어간다. */
export async function draftsFromProseGemini(
  text: string,
  cityHint: string,
): Promise<Draft[]> {
  if (!hasWorker) throw new Error('worker_not_configured')

  const res = await fetch(`${WORKER_URL}/parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, cityHint }),
  })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`worker_error ${res.status}: ${detail.slice(0, 200)}`)
  }

  const payload = (await res.json()) as { items?: WorkerItem[] }
  const items = payload.items ?? []

  return items
    .map((raw): Draft | null => {
      const kind: DraftKind =
        raw.kind === 'activity' || raw.kind === 'transfer' ? raw.kind : 'stop'
      if (kind === 'stop' && !raw.query) return null
      return {
        id: nextId(),
        kind,
        query: raw.query,
        title: raw.title,
        note: raw.note,
        // "09:40 공항 도착"처럼 메모에 시각이 있으면 일정에 그대로 고정된다
        startAt: /^\d{1,2}:\d{2}$/.test(raw.startAt ?? '') ? raw.startAt : undefined,
        durationMin: raw.durationMin,
        modeHints: (raw.modeHints ?? []).filter((m): m is TravelMode =>
          ['transit', 'walking', 'driving', 'bicycling'].includes(m),
        ),
        candidates: [],
        chosenIndex: null,
        status: kind === 'stop' ? 'pending' : 'manual',
      }
    })
    .filter((d): d is Draft => d !== null)
}

// ---------- 장소 후보 검색 ----------

const CANDIDATE_LIMIT = 3

export async function searchCandidates(
  placesLib: google.maps.PlacesLibrary,
  query: string,
  bias: { lat: number; lng: number },
): Promise<PlaceCandidate[]> {
  const { places } = await placesLib.Place.searchByText({
    textQuery: query,
    fields: ['id', 'displayName', 'formattedAddress', 'location', 'types'],
    language: 'ko',
    maxResultCount: CANDIDATE_LIMIT,
    locationBias: { center: bias, radius: 50_000 },
  })

  return places.map((p) => ({
    googlePlaceId: p.id,
    name: p.displayName ?? query,
    address: p.formattedAddress ?? '',
    lat: p.location?.lat() ?? 0,
    lng: p.location?.lng() ?? 0,
    types: p.types ?? [],
  }))
}

export function draftCategory(draft: Draft): PlaceCategory {
  if (draft.category) return draft.category
  const chosen =
    draft.chosenIndex !== null ? draft.candidates[draft.chosenIndex] : undefined
  return inferCategory(chosen?.types ?? [])
}
