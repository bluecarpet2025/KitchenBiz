'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const search = useSearchParams();

  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // On mount, try to finalize any auth flow (hash tokens or ?code=)
  useEffect(() => {
    (async () => {
      // 1) Magic link (hash tokens)
      const rawHash = typeof window !== 'undefined' ? window.location.hash : '';
      if (rawHash && rawHash.startsWith('#')) {
        const params = new URLSearchParams(rawHash.slice(1));
        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');

        if (access_token && refresh_token) {
          setStatus('Signing you in…');
          const { error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (error) {
            setStatus(error.message);
            return;
          }
          // Remove hash from the URL
          window.history.replaceState({}, '', window.location.pathname + window.location.search);
          const to = search.get('redirect') || '/';
          router.replace(to);
          return;
        }
      }

      // 2) OAuth / PKCE (?code=...)
      const code = search.get('code');
      if (code) {
        setStatus('Finishing sign-in…');
        const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
        if (error) {
          setStatus(error.message);
          return;
        }
        const to = search.get('redirect') || '/';
        router.replace(to);
        return;
      }

      // 3) Already signed in? Bounce away.
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const to = search.get('redirect') || '/';
        router.replace(to);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setSending(true);
    setStatus(null);
    const redirectTo = `${window.location.origin}/login`; // works in both dev & prod

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });

    if (error) setStatus(error.message);
    else setStatus('Check your email for the sign-in link.');
    setSending(false);
  }

  return (
    <div className="min-h-[70vh] grid place-items-center">
      <div className="w-full max-w-md space-y-4">
        <h1 className="text-2xl font-semibold">Sign in</h1>

        <form onSubmit={sendMagicLink} className="space-y-3">
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border rounded px-3 py-2 bg-transparent"
          />
          <button
            type="submit"
            disabled={sending}
            className="w-full bg-black text-white rounded px-3 py-2 disabled:opacity-50"
          >
            {sending ? 'Sending…' : 'Send magic link'}
          </button>
        </form>

        {status && <div className="text-sm opacity-80">{status}</div>}

        <p className="text-xs opacity-60">
          Tip: if the link opens in another browser/profile, copy the URL and paste it back into the same
          browser where you requested it.
        </p>
      </div>
    </div>
  );
}
