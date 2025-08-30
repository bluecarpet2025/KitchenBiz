export const dynamic = 'force-dynamic';
import dynamicImport from 'next/dynamic';
import { getEffectiveTenant } from "@/lib/effective-tenant";

const MenuPageClient = dynamicImport(() => import('@/components/MenuPageClient'));
export default function MenuPage() {
  return <MenuPageClient />;
}
