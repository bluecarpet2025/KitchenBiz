// src/app/profile/ProfileForm.tsx
"use client";

import { useMemo, useState } from "react";
import createClient from "@/lib/supabase/client";

type Plan = "starter" | "basic" | "pro" | "enterprise";

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

  // Plan is now read-only here (Stripe controls it via webhook → profiles.plan)
  const plan = (initialPlan as Plan) || "starter";

  const [brandingTier, setBrandingTier] = useState(initialBrandingTier);
  const [busy, setBusy] = useState(false);
  const [billingBusy, setBillingBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const supabase = createClient();

  const computedBrandingTier = useMemo(() => {
    if (plan === "starter") return "none";
    if (plan === "basic") return "one_time";
    return "unlimited";
  }, [plan]);

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

    // Profile save: name + demo toggle + branding tier only.
    // Plan is controlled by Stripe webhook sync (profiles.plan).
    const { error: profErr } = await supabase
      .from("profiles")
      .upsert(
        {
          id: user.id,
          display_name: name.trim(),
          use_demo: useDemo,
          branding_tier: computedBrandingTier,
        },
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

    setBrandingTier(computedBrandingTier);
    setBusy(false);
    setMsg(profErr?.message || tenantErr || "Saved ✓");
    setTimeout(() => setMsg(null), 4000);
  };

  async function startCheckout(body: any) {
    setBillingBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Checkout failed");
      if (j?.url) window.location.href = j.url;
      else throw new Error("Missing checkout URL");
    } catch (e: any) {
      setMsg(e?.message ?? "Billing error");
      setBillingBusy(false);
    }
  }

  async function openBillingPortal() {
    setBillingBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Portal failed");
      if (j?.url) window.location.href = j.url;
      else throw new Error("Missing portal URL");
    } catch (e: any) {
      setMsg(e?.message ?? "Billing error");
      setBillingBusy(false);
    }
  }

  const isOwner = role === "owner";
  const canBill = isOwner && !useDemo && !!tenantId;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="max-w-xl mt-6 space-y-4"
    >
      {msg && <div className="text-sm rounded-md px-3 py-2 bg-neutral-800">{msg}</div>}

      {/* Display Name */}
      <div>
        <label className="block text-sm mb-1">Display name</label>
        <input
          className="w-full bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Mario Rossi"
        />
      </div>

      {/* Demo Toggle */}
      <label className="inline-flex items-center gap-2 select-none cursor-pointer">
        <input type="checkbox" checked={useDemo} onChange={(e) => setUseDemo(e.target.checked)} />
        <span>Use demo data (read-only)</span>
      </label>

      {/* Billing / Plan (Owner only) */}
      {isOwner && (
        <div className="mt-4 border-t border-neutral-800 pt-4 space-y-3">
          <div>
            <div className="text-sm font-medium">Subscription Plan</div>
            <div className="text-xs opacity-70 mt-1">
              Your current plan is: <strong>{plan.toUpperCase()}</strong>
            </div>
            <div className="text-xs opacity-70">
              Plan changes happen via Stripe. After payment or plan change in the portal, the app updates within a few
              seconds.
            </div>
          </div>

          <div className="grid gap-2">
            <div className="border rounded-md p-3">
              <div className="font-medium">Basic — $49/mo</div>
              <div className="text-xs opacity-70">Unlimited history, receipt photo upload, visuals & exports.</div>
              <button
                type="button"
                disabled={!canBill || billingBusy}
                onClick={() => startCheckout({ kind: "subscription", plan: "basic" })}
                className="mt-2 border rounded px-3 py-2 text-sm hover:bg-neutral-900 disabled:opacity-50"
              >
                {plan === "basic" ? "Manage in Portal" : "Upgrade to Basic"}
              </button>
            </div>

            <div className="border rounded-md p-3">
              <div className="font-medium">Pro — $99/mo</div>
              <div className="text-xs opacity-70">Staff module, AI dashboards, custom branding.</div>
              <button
                type="button"
                disabled={!canBill || billingBusy}
                onClick={() => startCheckout({ kind: "subscription", plan: "pro" })}
                className="mt-2 border rounded px-3 py-2 text-sm hover:bg-neutral-900 disabled:opacity-50"
              >
                {plan === "pro" ? "Manage in Portal" : "Upgrade to Pro"}
              </button>
            </div>

            <div className="border rounded-md p-3 opacity-90">
              <div className="font-medium">Enterprise — $499/mo</div>
              <div className="text-xs opacity-70">Multi-location, white-label, custom integrations.</div>
              <button
                type="button"
                disabled={!canBill || billingBusy}
                onClick={() => startCheckout({ kind: "subscription", plan: "enterprise" })}
                className="mt-2 border rounded px-3 py-2 text-sm hover:bg-neutral-900 disabled:opacity-50"
              >
                Start Enterprise
              </button>
              <div className="text-xs opacity-60 mt-1">Hide this button until you’re ready.</div>
            </div>

            <div className="border rounded-md p-3">
              <div className="font-medium">AI Deep Business Report — $49 (one-time)</div>
              <div className="text-xs opacity-70">One-off deep report. Available for Basic+.</div>
              <button
                type="button"
                disabled={!canBill || billingBusy || plan === "starter"}
                onClick={() => startCheckout({ kind: "one_time", sku: "ai_deep_business_report" })}
                className="mt-2 border rounded px-3 py-2 text-sm hover:bg-neutral-900 disabled:opacity-50"
                title={plan === "starter" ? "Upgrade to Basic to purchase this." : ""}
              >
                Buy AI Report
              </button>
            </div>
          </div>

          <button
            type="button"
            disabled={!canBill || billingBusy}
            onClick={openBillingPortal}
            className="border rounded px-3 py-2 text-sm hover:bg-neutral-900 disabled:opacity-50"
          >
            Open Billing Portal
          </button>

          {!tenantId && <div className="text-xs opacity-70">Billing requires a tenant.</div>}
          {useDemo && <div className="text-xs opacity-70">Turn off demo mode to manage billing.</div>}

          <p className="text-xs mt-2 opacity-70">
            <strong>Branding Tier:</strong> {brandingTier} (auto from plan: {computedBrandingTier})
          </p>
        </div>
      )}

      {/* Business Info */}
      <div>
        <label className="block text-sm mb-1 mt-4">Business name</label>
        <input
          className="w-full bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2 disabled:opacity-60"
          value={bizName}
          onChange={(e) => setBizName(e.target.value)}
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
          onChange={(e) => setBizBlurb(e.target.value)}
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
