import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { hasSupabase } from './env'
import { AuthContext, type AuthState } from './authContext'

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
            // 로그인 후 돌아올 곳. Supabase 콘솔의 Redirect URLs에 등록돼 있어야 한다
            redirectTo: window.location.origin,
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
