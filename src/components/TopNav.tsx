'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function TopNav() {
  const pathname = usePathname();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, [pathname]);

  const authed = !!email;

  return (
    <header className="border-b border-neutral-800 bg-black">
      <div className="mx-auto max-w-6xl px-4 h-12 flex items-center gap-6">
        <Link href="/" className="font-semibold tracking-wide hover:opacity-80">
          Kitchen Biz
        </Link>

        {authed && (
          <nav className="flex items-center gap-4 text-sm">
            <NavLink href="/inventory" cur={pathname}>Inventory</NavLink>
            <NavLink href="/recipes"   cur={pathname}>Recipes</NavLink>
            <NavLink href="/menu"      cur={pathname}>Menu</NavLink>
          </nav>
        )}

        <div className="ml-auto text-sm">
          {!authed ? (
            <Link href="/login" className="border rounded px-3 py-1.5 hover:bg-neutral-900">Sign in</Link>
          ) : (
            <span className="opacity-70">{email}</span>
          )}
        </div>
      </div>
    </header>
  );
}

function NavLink({ href, cur, children }: { href: string; cur: string; children: React.ReactNode }) {
  const active = cur.startsWith(href);
  return (
    <Link
      href={href}
      className={[
        'px-2 py-1 rounded hover:bg-neutral-900',
        active ? 'bg-neutral-900' : ''
      ].join(' ')}
    >
      {children}
    </Link>
  );
}
