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

  // Plan is read-only here (Stripe controls it via webhook → profiles.plan)
  const plan = ((initialPlan as Plan) || "starter") as Plan;

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

  const planLabel = (p: Plan) => {
    if (p === "starter") return "Starter";
    if (p === "basic") return "Basic";
    if (p === "pro") return "Pro";
    return "Enterprise";
  };

  const planPrice = (p: Plan) => {
    if (p === "basic") return "$49/mo";
    if (p === "pro") return "$99/mo";
    if (p === "enterprise") return "$499/mo";
    return "Free";
  };

  const planBlurb = (p: Plan) => {
    if (p === "starter") return "Core features to get started.";
    if (p === "basic") return "Receipt photos, visuals & exports.";
    if (p === "pro") return "Staff module, AI dashboards, branding.";
    return "Multi-location, white-label, custom.";
  };

  const actionLabel = (target: Plan) => {
    if (plan === target) return "Manage in Portal";

    if (target === "starter") return "Switch to Free";

    if (target === "enterprise") return "Switch to Enterprise";
    if (target === "pro") return plan === "enterprise" ? "Downgrade to Pro" : "Upgrade to Pro";
    if (target === "basic") return plan === "starter" ? "Upgrade to Basic" : "Switch to Basic";
    return "Switch";
  };

  const onPlanClick = (target: Plan) => {
    // If already on that plan, open portal.
    if (plan === target) return openBillingPortal();

    // Switching to free isn't a Stripe Checkout flow; user cancels in the Portal.
    if (target === "starter") return openBillingPortal();

    return startCheckout({ kind: "subscription", plan: target });
  };

  const PlanCard = ({ target }: { target: Plan }) => {
    const active = plan === target;
    const disabled = !canBill || billingBusy;

    return (
      <div
        className={`border rounded-md p-3 ${
          active ? "border-green-700 bg-green-900/10" : "border-neutral-800"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="font-medium">
            {planLabel(target)} — {planPrice(target)}
          </div>
          {active && (
            <span className="text-[11px] px-2 py-0.5 rounded-full border border-green-700 text-green-300">
              Current
            </span>
          )}
        </div>

        <div className="text-xs opacity-70 mt-1">{planBlurb(target)}</div>

        <button
          type="button"
          disabled={disabled}
          onClick={() => onPlanClick(target)}
          className="mt-3 border rounded px-3 py-2 text-sm hover:bg-neutral-900 disabled:opacity-50"
        >
          {actionLabel(target)}
        </button>

        {/* Small hint only for switching to free */}
        {target === "starter" && plan !== "starter" && canBill && (
          <div className="text-[11px] opacity-60 mt-2">
            Switching to Free happens by canceling in the portal.
          </div>
        )}

        {!canBill && (
          <div className="text-[11px] opacity-60 mt-2">
            {useDemo ? "Turn off demo mode to manage billing." : !tenantId ? "Billing requires a tenant." : ""}
          </div>
        )}
      </div>
    );
  };

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
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-medium">Subscription</div>
            <div className="text-xs opacity-70">
              Current: <strong>{plan.toUpperCase()}</strong>
            </div>
          </div>

          {/* Cards (responsive) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <PlanCard target="starter" />
            <PlanCard target="basic" />
            <PlanCard target="pro" />
            <PlanCard target="enterprise" />
          </div>

          {/* Add-ons */}
          <div className="border border-neutral-800 rounded-md p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium">Add-ons</div>
              <button
                type="button"
                disabled={!canBill || billingBusy}
                onClick={openBillingPortal}
                className="border rounded px-3 py-2 text-xs hover:bg-neutral-900 disabled:opacity-50"
              >
                Billing Portal
              </button>
            </div>

            <div className="mt-2 flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium">AI Deep Business Report</div>
                <div className="text-xs opacity-70">$49 (one-time) • Available for Basic+</div>
              </div>

              <button
                type="button"
                disabled={!canBill || billingBusy || plan === "starter"}
                onClick={() => startCheckout({ kind: "one_time", sku: "ai_deep_business_report" })}
                className="border rounded px-3 py-2 text-sm hover:bg-neutral-900 disabled:opacity-50"
                title={plan === "starter" ? "Upgrade to Basic to purchase this." : ""}
              >
                Buy
              </button>
            </div>

            <div className="text-xs opacity-60 mt-2">
              Plan changes sync from Stripe via webhook (updates in a few seconds).
            </div>

            <p className="text-xs mt-2 opacity-70">
              <strong>Branding Tier:</strong> {brandingTier} (auto from plan: {computedBrandingTier})
            </p>
          </div>
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
