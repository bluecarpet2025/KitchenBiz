'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const PUBLIC_PATHS = ['/', '/login'];

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();

  // Write a small cookie the middleware can see
  function setAuthCookie(on: boolean) {
    // 30 days
    const base = 'Path=/; SameSite=Lax; Secure';
    if (on) {
      document.cookie = `kb_auth=1; Max-Age=${60 * 60 * 24 * 30}; ${base}`;
    } else {
      document.cookie = `kb_auth=; Max-Age=0; ${base}`;
    }
  }

  useEffect(() => {
    let mounted = true;

    (async () => {
      // 1) Handle magic-link hash if present
      if (typeof window !== 'undefined' && window.location.hash.includes('access_token')) {
        const params = new URLSearchParams(window.location.hash.substring(1));
        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');
        if (access_token && refresh_token) {
          await supabase.auth.setSession({ access_token, refresh_token });
          // Clear the hash
          window.history.replaceState({}, '', window.location.pathname + window.location.search);
        }
      }

      // 2) Check session
      const { data } = await supabase.auth.getSession();
      const has = !!data.session;
      if (mounted) {
        setSignedIn(has);
        setAuthCookie(has);
        setReady(true);
      }
    })();

    // 3) React to future auth changes
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      const has = !!session;
      setSignedIn(has);
      setAuthCookie(has);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Optional client redirect for public/private UX
  useEffect(() => {
    if (!ready) return;
    const isPublic = PUBLIC_PATHS.includes(pathname || '/');

    // If anon on a private page -> login
    if (!signedIn && !isPublic) {
      const redirect = encodeURIComponent((pathname || '/') + (search?.toString() ? `?${search}` : ''));
      router.replace(`/login?redirect=${redirect}`);
      return;
    }

    // If signed-in on /login -> home
    if (signedIn && pathname === '/login') {
      router.replace('/');
    }
  }, [ready, signedIn, pathname, search, router]);

  if (!ready) return null;
  return <>{children}</>;
}
