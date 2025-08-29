"use client";

import { useRouter } from "next/navigation";
import createClient from "@/lib/supabase/client";

export default function SignOutButton() {
  const router = useRouter();

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login"); // send back to login
  };

  return (
    <button
      onClick={signOut}
      className="text-sm text-neutral-300 hover:text-white underline underline-offset-4"
    >
      Sign out
    </button>
  );
}
