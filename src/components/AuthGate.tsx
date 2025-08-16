'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function AuthGate({ children }: { children: React.ReactNode }) {
  // helper to set/remove a tiny "I'm signed in" cookie that middleware can see
  function setAuthCookie(on: boolean) {
    if (typeof document === 'undefined') return;
    const secure = typeof window !== 'undefined' && window.location.protocol === 'https:';
    const base = `Path=/; SameSite=Lax; ${secure ? 'Secure; ' : ''}`;
    if (on) {
      // 30 days
      document.cookie = `kb_auth=1; Max-Age=${60 * 60 * 24 * 30}; ${base}`;
    } else {
      document.cookie = `kb_auth=; Max-Age=0; ${base}`;
    }
  }

  useEffect(() => {
    // 1) If the magic link arrived here, set the Supabase session from the hash
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    const hasTokens = hash && hash.includes('access_token');
    const applyHashSession = async () => {
      if (!hasTokens) return;
      const params = new URLSearchParams(hash.slice(1));
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');
      if (access_token && refresh_token) {
        await supabase.auth.setSession({ access_token, refresh_token });
      }
      // Clean the hash but keep the path and query
      window.history.replaceState({}, '', window.location.pathname + window.location.search);
    };

    (async () => {
      await applyHashSession();

      // 2) Reflect current session into our tiny cookie
      const { data } = await supabase.auth.getSession();
      setAuthCookie(!!data.session);
    })();

    // 3) Keep cookie in sync on future auth changes
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setAuthCookie(!!session);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return <>{children}</>;
}
