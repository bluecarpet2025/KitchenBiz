"use client";

import { useState } from "react";
import createClient from "@/lib/supabase/client";

export default function ProfileForm({
  initialName,
  initialUseDemo,
  initialBusinessName,
  tenantId,
}: {
  initialName: string;
  initialUseDemo: boolean;
  initialBusinessName: string;
  tenantId: string | null;
}) {
  const [name, setName] = useState(initialName);
  const [useDemo, setUseDemo] = useState(initialUseDemo);
  const [bizName, setBizName] = useState(initialBusinessName);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const supabase = createClient();

  const save = async () => {
    setBusy(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setMsg("Not signed in.");
      setBusy(false);
      return;
    }

    // 1) Save profile basics
    const { error: profErr } = await supabase
      .from("profiles")
      .upsert(
        { id: user.id, display_name: name.trim(), use_demo: useDemo },
        { onConflict: "id" }
      );

    // 2) Save tenant business name (only when not in demo)
    let tenantErr: string | null = null;
    if (!useDemo && tenantId) {
      const cleanName = bizName.trim().slice(0, 120);
      const { error } = await supabase
        .from("tenants")
        .update({ name: cleanName || null })
        .eq("id", tenantId);
      if (error) tenantErr = error.message;
    }

    setBusy(false);
    const message = profErr?.message || tenantErr || "Saved ✓";
    setMsg(message);
    setTimeout(() => setMsg(null), 4000);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="max-w-xl mt-6 space-y-4"
    >
      {msg && (
        <div className="mb-2 text-sm rounded-md px-3 py-2 bg-neutral-800">
          {msg}
        </div>
      )}

      <div>
        <label className="block text-sm mb-1">Display name</label>
        <input
          className="w-full bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Mario Rossi"
        />
      </div>

      <label className="inline-flex items-center gap-2 select-none cursor-pointer">
        <input
          type="checkbox"
          checked={useDemo}
          onChange={(e) => setUseDemo(e.target.checked)}
        />
        <span>Use demo data (read-only)</span>
      </label>

      <div>
        <label className="block text-sm mb-1">Business name</label>
        <input
          className="w-full bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2 disabled:opacity-60"
          value={bizName}
          onChange={(e) => setBizName(e.target.value)}
          placeholder="e.g., Roma Trattoria"
          disabled={useDemo || !tenantId}
        />
        <p className="text-xs opacity-70 mt-1">
          Used on printed/shared menus.
        </p>
      </div>

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
