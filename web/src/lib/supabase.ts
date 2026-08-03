import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL, hasSupabase } from './env'

/**
 * Supabase는 없어도 앱이 뜨게 둔다 — 키가 빠졌을 때 로그인 화면에서
 * 설정 안내를 보여주는 편이 흰 화면보다 낫다.
 */
export const supabase: SupabaseClient | null = hasSupabase
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // OAuth 리다이렉트로 돌아온 URL의 토큰을 세션으로 바꾼다
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    })
  : null

/** 호출부에서 매번 null 체크하지 않도록 */
export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error('supabase_not_configured')
  return supabase
}
