'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const PUBLIC = new Set(['/','/login']); // <- add '/'

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (PUBLIC.has(pathname)) { setReady(true); return; }
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.replace('/login');
      else setReady(true);
    });
  }, [pathname, router]);

  if (!ready) return null;
  return <>{children}</>;
}
