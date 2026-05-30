import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/api/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  // The signed-in user's profile (role + provider_id). Load-bearing for
  // the provider-refusal guard in RequireAuth: the CRM must never render
  // its UI to a profile.role === 'provider' session. profileLoading
  // stays true until the role is known so the guard can hold rendering.
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Fetch the caller's own profile whenever the user changes. The
  // "profiles own read" policy (migration 0011) returns the row where
  // id = auth.uid(), or nothing. We only need role here; provider_id is
  // irrelevant to the CRM (providers are bounced to the portal).
  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }
    let active = true;
    setProfileLoading(true);
    supabase
      .from('profiles')
      .select('id, role, provider_id')
      .eq('id', uid)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.error('profile fetch failed', error);
          setProfile(null);
        } else {
          setProfile(data ?? null);
        }
        setProfileLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session?.user?.id]);

  // Request a 6-digit code (and a magic link, in the same email; the user
  // typically just types the code so the flow stays inside the PWA).
  async function requestEmailOtp(email) {
    return supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/`,
      },
    });
  }

  async function verifyEmailOtp(email, token) {
    return supabase.auth.verifyOtp({
      email,
      token: token.trim(),
      type: 'email',
    });
  }

  async function signOut() {
    return supabase.auth.signOut();
  }

  const value = {
    session,
    user: session?.user ?? null,
    loading,
    profile,
    profileLoading,
    requestEmailOtp,
    verifyEmailOtp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
