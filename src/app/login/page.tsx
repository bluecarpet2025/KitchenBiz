'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string|null>(null);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/app` } // after login, go to /app
    });
    if (error) setErr(error.message); else setSent(true);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={sendLink} className="max-w-sm w-full space-y-4">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        {sent ? <p>Check your email for the sign-in link.</p> : (
          <>
            <input
              className="border rounded w-full p-2"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
            <button className="bg-black text-white rounded px-4 py-2 w-full">
              Send magic link
            </button>
          </>
        )}
        {err && <p className="text-red-600 text-sm">{err}</p>}
      </form>
    </div>
  );
}
