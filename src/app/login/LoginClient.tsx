// src/app/login/LoginClient.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function LoginClient() {
  const router = useRouter();
  const search = useSearchParams();

  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const redirect = search?.get('redirect') || '/';

  // Handle magic-link hash (access_token/refresh_token in URL fragment)
  useEffect(() => {
    (async () => {
      if (typeof window === 'undefined') return;
      const hash = window.location.hash;
      if (!hash.includes('access_token')) return;

      const params = new URLSearchParams(hash.slice(1));
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');

      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
        if (!error) {
          // Clear the hash and go where the user wanted
          const url = new URL(window.location.href);
          url.hash = '';
          window.history.replaceState({}, '', url.toString());
          router.replace(redirect);
          return;
        }
        setStatus(error.message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setStatus('Sending magic link…');

    const origin =
      typeof window !== 'undefined' ? window.location.origin : '';
    // Bring users back to /login (the page that processes the hash), preserving redirect.
    const emailRedirectTo = `${origin}/login${
      redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''
    }`;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo },
    });

    if (error) setStatus(error.message);
    else setStatus('Check your email for a sign-in link.');
  }

  return (
    <form onSubmit={sendLink} className="space-y-3">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="w-full border bg-transparent p-2 rounded"
      />
      <button type="submit" className="bg-black text-white rounded px-4 py-2">
        Send magic link
      </button>

      <p className="text-xs text-neutral-400">
        Tip: If the link opens in another browser/profile, copy the URL and
        paste it back into the same browser where you requested it.
      </p>

      {status && <div className="text-sm text-neutral-300">{status}</div>}
    </form>
  );
}
