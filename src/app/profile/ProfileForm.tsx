"use client";

import { useState } from "react";
import createClient from "@/lib/supabase/client";

export default function ProfileForm({
  initialName,
  initialUseDemo,
  initialBusinessName,
  initialBusinessBlurb,
  tenantId,
  role,
  initialPlan,
  initialBrandingTier,
}: {
  initialName: string;
  initialUseDemo: boolean;
  initialBusinessName: string;
  initialBusinessBlurb: string;
  tenantId: string | null;
  role: string;
  initialPlan: string;
  initialBrandingTier: string;
}) {
  const [name, setName] = useState(initialName);
  const [useDemo, setUseDemo] = useState(initialUseDemo);
  const [bizName, setBizName] = useState(initialBusinessName);
  const [bizBlurb, setBizBlurb] = useState(initialBusinessBlurb);
  const [plan, setPlan] = useState(initialPlan);
  const [brandingTier, setBrandingTier] = useState(initialBrandingTier);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const supabase = createClient();

  const save = async () => {
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setMsg("Not signed in."); setBusy(false); return; }

    // Handle auto-branding rules by plan
    let newBranding = brandingTier;
    if (plan === "starter") newBranding = "none";
    else if (plan === "basic") newBranding = "one_time";
    else newBranding = "unlimited";

    const { error: profErr } = await supabase
      .from("profiles")
      .upsert(
        { id: user.id, display_name: name.trim(), use_demo: useDemo, plan, branding_tier: newBranding },
        { onConflict: "id" }
      );

    // Save tenant info if applicable
    let tenantErr: string | null = null;
    if (!useDemo && tenantId) {
      const cleanName = bizName.trim().slice(0, 120);
      const cleanBlurb = bizBlurb.trim().slice(0, 240);
      const { data: updated, error } = await supabase
        .from("tenants")
        .update({ name: cleanName || null, short_description: cleanBlurb || null })
        .eq("id", tenantId)
        .select("id, name, short_description")
        .maybeSingle();
      if (error) tenantErr = error.message;
      if (updated) {
        setBizName(updated.name ?? "");
        setBizBlurb(updated.short_description ?? "");
      }
    }

    setBrandingTier(newBranding);
    setBusy(false);
    setMsg(profErr?.message || tenantErr || "Saved ✓");
    setTimeout(() => setMsg(null), 4000);
  };

  // Button styles for plan selector
  const planButton = (value: string, label: string) => {
    const active = plan === value;
    return (
      <button
        type="button"
        onClick={() => setPlan(value)}
        className={`px-3 py-2 rounded-md border text-sm ${
          active
            ? "bg-green-800 border-green-600"
            : "bg-neutral-900 border-neutral-700 hover:bg-neutral-800"
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <form onSubmit={(e)=>{e.preventDefault(); save();}} className="max-w-xl mt-6 space-y-4">
      {msg && <div className="text-sm rounded-md px-3 py-2 bg-neutral-800">{msg}</div>}

      {/* Display Name */}
      <div>
        <label className="block text-sm mb-1">Display name</label>
        <input
          className="w-full bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2"
          value={name}
          onChange={(e)=>setName(e.target.value)}
          placeholder="e.g., Mario Rossi"
        />
      </div>

      {/* Demo Toggle */}
      <label className="inline-flex items-center gap-2 select-none cursor-pointer">
        <input type="checkbox" checked={useDemo} onChange={(e)=>setUseDemo(e.target.checked)} />
        <span>Use demo data (read-only)</span>
      </label>

      {/* Plan Selector (Owner only) */}
      {role === "owner" && (
        <div className="mt-4 border-t border-neutral-800 pt-4">
          <label className="block text-sm mb-2">Subscription Plan</label>
          <div className="flex flex-wrap gap-2">
            {planButton("starter", "Starter (Free)")}
            {planButton("basic", "Basic ($49/mo)")}
            {planButton("pro", "Pro ($99/mo)")}
            {planButton("enterprise", "Enterprise ($499/mo)")}
          </div>
          <p className="text-xs mt-2 opacity-70">
            <strong>Branding Tier:</strong> {brandingTier}
          </p>
        </div>
      )}

      {/* Business Info */}
      <div>
        <label className="block text-sm mb-1 mt-4">Business name</label>
        <input
          className="w-full bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2 disabled:opacity-60"
          value={bizName}
          onChange={(e)=>setBizName(e.target.value)}
          placeholder="e.g., Roma Trattoria"
          disabled={useDemo || !tenantId}
        />
        <p className="text-xs opacity-70 mt-1">Shown on printed/shared menus.</p>
      </div>

      <div>
        <label className="block text-sm mb-1">Short description</label>
        <input
          className="w-full bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2 disabled:opacity-60"
          value={bizBlurb}
          onChange={(e)=>setBizBlurb(e.target.value)}
          placeholder="e.g., Family-owned Italian kitchen since 1998."
          disabled={useDemo || !tenantId}
        />
        <p className="text-xs opacity-70 mt-1">Appears under the business name on print/share.</p>
      </div>

      {/* Save */}
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
