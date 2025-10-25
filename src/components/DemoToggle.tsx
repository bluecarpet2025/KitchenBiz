"use client";

import { useEffect, useState, useTransition } from "react";
import createBrowserClient from "@/lib/supabase/client";

export default function DemoToggle() {
  const [pending, startTransition] = useTransition();
  const [useDemo, setUseDemo] = useState<boolean | null>(null);

  // Fetch current demo mode from profile
  useEffect(() => {
    const load = async () => {
      const supabase = createBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: prof } = await supabase
        .from("profiles")
        .select("use_demo")
        .eq("id", user.id)
        .maybeSingle();
      setUseDemo(!!prof?.use_demo);
    };
    load();
  }, []);

  const toggle = async () => {
    if (useDemo === null) return;
    startTransition(async () => {
      const supabase = createBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const newVal = !useDemo;
      await supabase.from("profiles").update({ use_demo: newVal }).eq("id", user.id);
      setUseDemo(newVal);
      window.location.reload(); // force data reload
    });
  };

  return (
    <button
      onClick={toggle}
      disabled={pending || useDemo === null}
      className={`border rounded px-3 py-1 text-sm ${
        useDemo ? "bg-emerald-700 text-white" : "hover:bg-neutral-900"
      }`}
      title="Toggle between Demo and Real data"
    >
      {pending ? "Switching..." : useDemo ? "Demo Mode" : "Real Mode"}
    </button>
  );
}
