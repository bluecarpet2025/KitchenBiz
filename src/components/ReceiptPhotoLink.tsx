"use client";

import createClient from "@/lib/supabase/client";
import { useMemo, useState } from "react";

export default function ReceiptPhotoLink({ path }: { path: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function openPhoto() {
    try {
      setBusy(true);
      setErr(null);
      const { data, error } = await supabase
        .storage
        .from("receipts")
        .createSignedUrl(path, 60); // 60s temporary URL

      if (error) throw error;
      const url = data?.signedUrl;
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      setErr(e?.message ?? "Could not open photo");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openPhoto}
        className="underline text-sm disabled:opacity-50"
        disabled={busy}
      >
        View photo
      </button>
      {err && <span className="ml-2 text-xs text-red-300">{err}</span>}
    </>
  );
}
