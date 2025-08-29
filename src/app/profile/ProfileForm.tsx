"use client";
import { useState } from "react";
import createClient from "@/lib/supabase/client";

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

  const save = async () => {
    setBusy(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setMsg("Not signed in."); setBusy(false); return; }
    const { error } = await supabase
      .from("profiles")
      .upsert(
        { id: user.id, display_name: name.trim(), use_demo: useDemo },
        { onConflict: "id" }
      );
    setBusy(false);
    setMsg(error ? error.message : "Saved ✓");
    setTimeout(() => setMsg(null), 4000);
  };

  return (
    <form onSubmit={(e)=>{e.preventDefault(); save();}} className="max-w-xl mt-6">
      {msg && <div className="mb-3 text-sm rounded-md px-3 py-2 bg-neutral-800">{msg}</div>}

      <label className="block text-sm mb-1">Display name</label>
      <input
        className="w-full bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2 mb-4"
        value={name}
        onChange={(e)=>setName(e.target.value)}
        placeholder="e.g., Mario Rossi"
      />

      <label className="inline-flex items-center gap-2 mb-4 select-none cursor-pointer">
        <input
          type="checkbox"
          checked={useDemo}
          onChange={(e)=>setUseDemo(e.target.checked)}
        />
        <span>Use demo data (read-only)</span>
      </label>

      <div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md px-4 py-2 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
