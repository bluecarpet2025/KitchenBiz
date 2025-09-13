export const dynamic = "force-dynamic";

import dynamicImport from "next/dynamic";
import { createServerClient } from "@/lib/supabase/server";
import { getEffectiveTenant } from "@/lib/effective-tenant";

const MenuPageClient = dynamicImport(() => import("@/components/MenuPageClient"));

export default async function MenuPage() {
  const supabase = await createServerClient();
  const tenantId = await getEffectiveTenant(supabase); // respects demo toggle

  return <MenuPageClient initialTenantId={tenantId ?? null} />;
}
