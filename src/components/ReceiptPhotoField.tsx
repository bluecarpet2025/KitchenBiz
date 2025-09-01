"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import createClient from "@/lib/supabase/client";

type Props = {
  tenantId: string;
  onUploaded: (path: string | null) => void; // we’ll pass the storage path back to your form
};

export default function ReceiptPhotoField({ tenantId, onUploaded }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [msg, setMsg] = useState<string>("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function upload(f: File) {
    try {
      setStatus("uploading");
      setMsg("");
      const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
      const key = `${tenantId}/${crypto.randomUUID()}.${ext}`;

      const { error } = await supabase
        .storage
        .from("receipts")
        .upload(key, f, {
          cacheControl: "3600",
          upsert: false,
          contentType: f.type || "image/jpeg",
        });

      if (error) throw error;
      setStatus("done");
      setMsg("Photo uploaded.");
      onUploaded(key);
    } catch (e: any) {
      console.error(e);
      setStatus("error");
      setMsg(e?.message ?? "Upload failed");
      onUploaded(null);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (f) void upload(f);
  }

  function clearPhoto() {
    setFile(null);
    setStatus("idle");
    setMsg("");
    onUploaded(null);
    inputRef.current?.value && (inputRef.current.value = "");
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">Receipt photo (optional)</label>

      <div className="flex gap-3 items-center">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"         // mobile: open rear camera
          onChange={onPick}
          className="block w-full text-sm file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border file:border-neutral-700 file:bg-neutral-900 file:text-neutral-200"
        />
        {file && (
          <button
            type="button"
            className="text-sm underline opacity-80 hover:opacity-100"
            onClick={clearPhoto}
          >
            Remove
          </button>
        )}
      </div>

      {previewUrl && (
        <div className="border border-neutral-800 rounded-md p-2 inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="Receipt preview" className="max-h-48 rounded" />
        </div>
      )}

      {status !== "idle" && (
        <p
          className={
            "text-xs " +
            (status === "error"
              ? "text-red-300"
              : status === "uploading"
              ? "text-neutral-300"
              : "text-green-300")
          }
        >
          {status === "uploading" ? "Uploading…" : msg}
        </p>
      )}

      <p className="text-xs text-neutral-400">
        JPG/PNG/WEBP up to 10&nbsp;MB. The photo uploads as soon as you pick it.
      </p>
    </div>
  );
}
