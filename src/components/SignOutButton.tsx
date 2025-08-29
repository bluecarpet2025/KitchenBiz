"use client";
import createClient from "@/lib/supabase/client";

export default function SignOutButton() {
  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  };
  return (
    <button onClick={signOut} className="underline text-sm">
      Sign out
    </button>
  );
}
