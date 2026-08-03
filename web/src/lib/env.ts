/**
 * 환경변수 접근은 전부 여기를 거친다.
 * import.meta.env를 컴포넌트에 흩뿌리면 키가 빠졌을 때 어디서 터지는지 추적이 안 된다.
 */

export const GOOGLE_MAPS_API_KEY = (
  import.meta.env?.VITE_GOOGLE_MAPS_API_KEY ?? ''
).trim()

/** Advanced Marker를 쓰려면 Map ID가 필요하다. 없으면 기본 마커로 폴백. */
export const GOOGLE_MAPS_MAP_ID = (
  import.meta.env?.VITE_GOOGLE_MAPS_MAP_ID ?? ''
).trim()

/** Gemini 중계 프록시(Vercel). 비어 있으면 텍스트 파서만 비활성화된다. */
export const PARSER_URL = (import.meta.env?.VITE_PARSER_URL ?? '').trim().replace(/\/$/, '')

/** Supabase — 서버가 정본이다 (DESIGN.md §5) */
export const SUPABASE_URL = (import.meta.env?.VITE_SUPABASE_URL ?? '').trim()
export const SUPABASE_ANON_KEY = (
  import.meta.env?.VITE_SUPABASE_ANON_KEY ?? ''
).trim()

export const hasMapsKey = GOOGLE_MAPS_API_KEY.length > 0
// URL 형태가 아니면 프록시가 설정되지 않은 것으로 본다.
// 키를 잘못 넣는 실수가 흔한데, 그대로 두면 엉뚱한 곳으로 POST를 날린다.
export const parserUrlLooksValid = /^https?:\/\//i.test(PARSER_URL)
export const hasParser = parserUrlLooksValid
export const hasSupabase = SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0
