"use client";

import * as React from "react";

type Props = {
  className?: string;
  source?: string; // e.g. "landing"
};

export default function SignupForm({ className = "", source = "landing" }: Props) {
  const [email, setEmail] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [banner, setBanner] = React.useState<{ type: "success" | "error"; msg: string } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setBanner(null);
    try {
      const res = await fetch("/api/optin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || "Upload failed");
      }
      setBanner({ type: "success", msg: "Thanks! You’re on the list. We’ll email you when we have testing slots or updates." });
      setEmail("");
    } catch (err: any) {
      setBanner({ type: "error", msg: err?.message ?? "Something went wrong" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      {banner && (
        <div
          className={`mb-3 flex items-start justify-between rounded-md border px-3 py-2 text-sm ${
            banner.type === "success" ? "border-green-600 text-green-300" : "border-red-600 text-red-300"
          }`}
        >
          <div className="pr-3">{banner.msg}</div>
          <button
            type="button"
            aria-label="Dismiss"
            className="opacity-70 hover:opacity-100"
            onClick={() => setBanner(null)}
          >
            ✕
          </button>
        </div>
      )}

      <form onSubmit={onSubmit} className="flex flex-col md:flex-row gap-2">
        <input
          type="email"
          required
          placeholder="your@email.com"
          className="w-full md:w-auto flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-md border px-4 py-2 text-sm hover:bg-neutral-900 disabled:opacity-50"
        >
          {busy ? "Saving..." : "Join the beta list"}
        </button>
      </form>
    </div>
  );
}
