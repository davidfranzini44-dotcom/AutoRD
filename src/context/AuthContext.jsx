import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (uid) => {
    if (!uid) { setProfile(null); return }
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).single()
    setProfile(data || null)
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      loadProfile(data.session?.user?.id).finally(() => setLoading(false))
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      loadProfile(s?.user?.id)
    })
    return () => sub.subscription.unsubscribe()
  }, [loadProfile])

  const signIn = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }, [])

  const signUp = useCallback(async (email, password, meta) => {
    const { error } = await supabase.auth.signUp({
      email, password, options: { data: meta },
    })
    if (error) throw error
  }, [])

  // Frictionless identity: create a real (but account-less) user so KYC + the
  // financing pipeline work without a signup screen. The cédula + Didit are the
  // actual identity; a WhatsApp "claim" can upgrade this later.
  const signInAnon = useCallback(async () => {
    const { error } = await supabase.auth.signInAnonymously({ options: { data: { role: 'buyer' } } })
    if (error) throw error
  }, [])

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut()
    setSession(null); setProfile(null)
  }, [])

  const value = {
    configured: isSupabaseConfigured,
    session,
    user: session?.user || null,
    profile,
    role: profile?.role || null,
    loading,
    signIn, signUp, signInAnon, signOut,
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
