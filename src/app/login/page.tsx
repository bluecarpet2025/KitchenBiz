'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setStatus('Sending magic link…');

    // Redirect back to the current site after clicking the email link
    const redirectTo = `${window.location.origin}/login`;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });

    if (error) setStatus(error.message);
    else setStatus('Check your email for the magic link.');
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <form onSubmit={sendMagicLink} className="w-full max-w-md space-y-4">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <input
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border rounded px-3 py-2 bg-black text-white"
        />
        <button type="submit" className="w-full bg-black text-white rounded px-3 py-2">
          Send magic link
        </button>
        {status && <div className="text-sm opacity-80">{status}</div>}
      </form>
    </div>
  );
}
