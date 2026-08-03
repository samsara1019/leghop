import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { hasSupabase } from './env'
import { AuthContext, type AuthState } from './authContext'

/**
 * 로그인 후 돌아올 현재 주소.
 *
 * 이전 콜백이 남긴 파라미터를 지운다. 실패한 로그인을 다시 시도할 때
 * `?error=...`를 그대로 들고 돌아가면 성공해도 에러 화면이 보인다.
 */
function returnUrl() {
  const url = new URL(window.location.href)
  url.hash = ''
  for (const key of ['code', 'error', 'error_code', 'error_description']) {
    url.searchParams.delete(key)
  }
  return url.toString()
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  // Supabase가 없으면 기다릴 게 없다
  const [ready, setReady] = useState(!hasSupabase)

  useEffect(() => {
    if (!supabase) return

    // 새로고침 직후에는 저장된 세션을 복구하는 동안 잠깐 비어 있다.
    // 이때 로그인 화면을 깜빡 보여주지 않으려고 ready를 따로 둔다.
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setReady(true)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      ready,
      session,
      user: session?.user ?? null,
      signInWithGoogle: async () => {
        if (!supabase) throw new Error('supabase_not_configured')
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            // 열고 있던 페이지로 돌아온다. origin만 넘기면 공유 링크로 들어온
            // 사람이 로그인 후 여행이 아니라 목록으로 떨어진다.
            // 여기 값이 Supabase 콘솔의 Redirect URLs에 없으면 Supabase는
            // 조용히 Site URL로 보낸다 — 기본값이 localhost:3000이다.
            redirectTo: returnUrl(),
          },
        })
        if (error) throw error
      },
      signOut: async () => {
        if (!supabase) return
        await supabase.auth.signOut()
      },
    }),
    [ready, session],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
