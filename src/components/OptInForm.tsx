"use client";

import { useState } from "react";

export default function OptInForm() {
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch("/api/optin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Upload failed");
      setMsg({ kind: "ok", text: "Thanks! You’re on the list." });
      setEmail("");
      setNote("");
    } catch (err: any) {
      setMsg({ kind: "err", text: err?.message ?? "Something went wrong" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-10 border border-neutral-800 rounded-xl p-5">
      <h3 className="text-lg font-semibold mb-2">Join the beta / leave feedback</h3>
      <p className="text-neutral-300 text-sm mb-4">
        Drop your email to get invited and share feedback. (Email required.)
      </p>
      {msg && (
        <div
          className={`mb-3 text-sm rounded-md px-3 py-2 ${
            msg.kind === "ok" ? "bg-green-900/30 text-green-300" : "bg-red-900/30 text-red-300"
          }`}
        >
          <div className="flex justify-between items-center">
            <span>{msg.text}</span>
            <button onClick={() => setMsg(null)} className="opacity-70 hover:opacity-100">
              ×
            </button>
          </div>
        </div>
      )}
      <form onSubmit={submit} className="flex flex-col gap-3 max-w-xl">
        <input
          type="email"
          required
          placeholder="your@email.com"
          className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <textarea
          placeholder="Optional: anything you want us to know"
          className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2 min-h-[80px]"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button
          disabled={busy}
          className="self-start rounded-md bg-neutral-100 text-black px-4 py-2 disabled:opacity-50"
        >
          {busy ? "Sending…" : "Send"}
        </button>
      </form>
    </div>
  );
}
