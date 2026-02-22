// src/app/profile/page.tsx
import { createServerClient } from "@/lib/supabase/server";
import ProfileForm from "./ProfileForm";

export default async function ProfilePage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <p>
          Please{" "}
          <a className="underline" href="/login">
            log in
          </a>
          .
        </p>
      </main>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, use_demo, tenant_id, role, plan, branding_tier")
    .eq("id", user.id)
    .maybeSingle();

  let businessName = "";
  let businessBlurb = "";

  if (profile?.tenant_id) {
    const { data: t } = await supabase
      .from("tenants")
      .select("name, short_description")
      .eq("id", profile.tenant_id)
      .maybeSingle();

    businessName = (t?.name ?? "").toString();
    businessBlurb = (t?.short_description ?? "").toString();
  }

  // Server-side env var (safe here)
  const discordInviteUrl = process.env.DISCORD_INVITE_URL;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">Profile</h1>

      <ProfileForm
        initialName={profile?.display_name ?? ""}
        initialUseDemo={!!profile?.use_demo}
        initialBusinessName={businessName}
        initialBusinessBlurb={businessBlurb}
        tenantId={(profile?.tenant_id as string) ?? null}
        role={profile?.role ?? "owner"}
        initialPlan={profile?.plan ?? "starter"}
        initialBrandingTier={profile?.branding_tier ?? "none"}
      />

      {/* Community (Discord) */}
      {discordInviteUrl ? (
        <section className="mt-8 border border-neutral-800 rounded-lg p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Community (Discord)</div>
              <p className="mt-1 text-xs text-neutral-400 max-w-xl">
                Join the private Kiori Discord to ask questions, get help from other users, share feedback, and stay up to date with what’s being
                built. Optional.
              </p>
            </div>

            <a
              href={discordInviteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-md border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-900"
            >
              Join Discord
              <ExternalLinkIcon />
            </a>
          </div>

          <p className="mt-3 text-[11px] text-neutral-500">
            Invite links may rotate if shared publicly.
          </p>
        </section>
      ) : null}

      <p className="mt-6 text-sm text-neutral-400">
        When <strong>Use demo data</strong> is on, you’ll see the read-only <em> Pizza Demo (Tester)</em> tenant everywhere. Business settings are
        disabled in demo mode.
      </p>
    </main>
  );
}

function ExternalLinkIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M14 3h7v7" />
      <path d="M10 14L21 3" />
      <path d="M21 14v6a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V4a1 1 0 0 1 1-1h6" />
    </svg>
  );
}