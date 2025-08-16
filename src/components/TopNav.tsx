'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function TopNav() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    // initial fetch
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    // keep it in sync
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <header className="border-b border-neutral-800 bg-black/60 backdrop-blur">
      <nav className="mx-auto max-w-6xl flex items-center justify-between px-4 py-3">
        <Link href="/" className="font-semibold tracking-tight">Kitchen Biz</Link>

        <div className="flex items-center gap-6">
          <Link href="/inventory" className="hover:underline">Inventory</Link>
          <Link href="/recipes" className="hover:underline">Recipes</Link>
          <Link href="/menu" className="hover:underline">Menu</Link>
        </div>

        <div className="text-sm opacity-80">{email ?? ''}</div>
      </nav>
    </header>
  );
}
