'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function TopNav() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  return (
    <header className="border-b border-neutral-800 bg-black/60 backdrop-blur">
      <nav className="mx-auto max-w-6xl flex items-center justify-between px-4 py-3">
        <a href="/" className="font-semibold tracking-tight">Kitchen Biz</a>

        <div className="flex items-center gap-6">
          <a href="/inventory" className="hover:underline">Inventory</a>
          <a href="/recipes" className="hover:underline">Recipes</a>
          <a href="/menu" className="hover:underline">Menu</a>
        </div>

        <div className="text-sm opacity-80">{email ?? ''}</div>
      </nav>
    </header>
  );
}
