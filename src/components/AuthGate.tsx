'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function AuthGate({ children }: { children: React.ReactNode }) {
  // Only handle the magic-link hash -> Supabase session once,
  // and then clear the hash. No redirects here; middleware handles protection.
  useEffect(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    if (hash && hash.includes('access_token')) {
      const params = new URLSearchParams(hash.slice(1));
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');
      if (access_token && refresh_token) {
        supabase.auth
          .setSession({ access_token, refresh_token })
          .finally(() => {
            // remove hash but keep the path and query
            window.history.replaceState(
              {},
              '',
              window.location.pathname + window.location.search
            );
          });
      }
    }
  }, []);

  return <>{children}</>;
}
