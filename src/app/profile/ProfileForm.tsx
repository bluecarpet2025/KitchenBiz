"use client";

import { useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";

export default function ProfileForm({
  initialName,
  initialUseDemo,
}: {
  initialName: string;
  initialUseDemo: boolean;
}) {
  const [name, setName] = useState(initialName);
  const [useDemo, setUseDemo] = useState(initialUseDemo);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    const supabase = createBrowserClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setBusy(false);
      setMsg("Not signed in.");
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .upsert({ id: user.id, display_name: name.trim(), use_demo: useDemo }, { onConflict: "id" });

    if (error) setMsg(error.message);
    else setMsg("Saved.");
    setBusy(false);
  }

  return (
    <div className="max-w-xl">
      {msg && (
        <div className="mb-3 text-sm rounded-md px-3 py-2 bg-neutral-800 text-neutral-200 flex justify-between">
          <span>{msg}</span>
          <button onClick={() => setMsg(null)} className="opacity-70 hover:opacity-100">×</button>
        </div>
      )}
      <label className="block text-sm mb-1">Display name</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g., Mario Rossi"
        className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2"
      />

      <label className="flex items-center gap-2 mt-4">
        <input type="checkbox" checked={useDemo} onChange={(e) => setUseDemo(e.target.checked)} />
        Use demo data (read-only)
      </label>

      <button
        onClick={save}
        disabled={busy}
        className="mt-4 rounded-md bg-neutral-100 text-black px-4 py-2 disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
