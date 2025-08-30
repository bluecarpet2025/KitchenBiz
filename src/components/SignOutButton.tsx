"use client";

import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";

export default function SignOutButton() {
  const router = useRouter();

  const signOut = async () => {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    router.refresh();
  };

  return (
    <button onClick={signOut} className="text-sm underline underline-offset-4">
      Sign out
    </button>
  );
}
