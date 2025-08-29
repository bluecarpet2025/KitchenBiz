"use client";
import { useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";

export default function FeedbackForm() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setOk(null); setErr(null); setBusy(true);
    try {
      const supabase = createBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");
      const { error } = await supabase.from("user_feedback").insert({
        uid: user.id,
        message: message.trim(),
      });
      if (error) throw error;
      setOk("Thanks for the feedback!");
      setMessage("");
    } catch (e: any) {
      setErr(e.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      {ok && <div className="text-green-300 text-sm">{ok}</div>}
      {err && <div className="text-red-300 text-sm">{err}</div>}
      <textarea
        required
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Your feedback…"
        className="w-full min-h-[120px] rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2"
      />
      <button disabled={busy} className="rounded-md bg-neutral-100 text-black px-4 py-2 disabled:opacity-50">
        {busy ? "Sending…" : "Send"}
      </button>
    </form>
  );
}
