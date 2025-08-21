// src/app/menu/page.tsx
export const dynamic = 'force-dynamic';
import dynamicImport from 'next/dynamic';

const MenuPageClient = dynamicImport(() => import('@/components/MenuPageClient'));

export default function MenuPage() {
  return <MenuPageClient />;
}
