"use client";

import createClient from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function SignOutButton() {
  const router = useRouter();

  const onClick = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  return (
    <button
      onClick={onClick}
      className="text-sm underline underline-offset-4 opacity-80 hover:opacity-100"
    >
      Sign out
    </button>
  );
}
