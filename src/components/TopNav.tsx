// src/components/TopNav.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import createClient from "@/lib/supabase/client";
import SignOutButton from "./SignOutButton";

export default function TopNav() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  return (
    <nav className="flex items-center justify-between px-4 py-3 border-b border-neutral-900">
      <div className="flex items-center gap-6">
        <Link href="/" className="font-semibold">Kitchen Biz</Link>
        <Link href="/inventory" className="hover:underline">Inventory</Link>
        <Link href="/recipes" className="hover:underline">Recipes</Link>
        <Link href="/menu" className="hover:underline">Menu</Link>
      </div>

      <div className="flex items-center gap-4">
        {email ? (
          <>
            <Link href="/profile" className="hover:underline">{email}</Link>
            <SignOutButton />
          </>
        ) : (
          <Link href="/login" className="underline">Log in / Sign up</Link>
        )}
      </div>
    </nav>
  );
}
