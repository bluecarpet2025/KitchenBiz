// src/app/profile/ProfileForm.tsx
"use client";
import * as React from "react";

export default function ProfileForm({
  initialDisplayName,
  initialUseDemo,
}: {
  initialDisplayName: string;
  initialUseDemo: boolean;
}) {
  const [displayName, setDisplayName] = React.useState(initialDisplayName);
  const [useDemo, setUseDemo] = React.useState(initialUseDemo);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);

    const res = await fetch("/api/profile/update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ display_name: displayName, use_demo: useDemo }),
    });

    if (res.ok) setMsg("Saved! Refresh other pages to apply demo view.");
    else setMsg(`Error: ${await res.text()}`);

    setBusy(false);
  }

  return (
    <form onSubmit={onSave} className="space-y-4">
      <div>
        <label className="block text-sm mb-1">Display name</label>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2"
          placeholder="e.g., Mario Rossi"
        />
      </div>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={useDemo}
          onChange={(e) => setUseDemo(e.target.checked)}
        />
        <span>Use demo data (read-only)</span>
      </label>

      <button
        disabled={busy}
        className="rounded-md px-4 py-2 bg-neutral-200 text-black disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save"}
      </button>

      {msg && <div className="text-sm text-neutral-400">{msg}</div>}
    </form>
  );
}
