// src/app/menu/page.tsx
import dynamicImport from 'next/dynamic';

export const dynamic = 'force-dynamic';

// Load the client UI without SSR to avoid importing the browser Supabase client on the server.
const MenuPageClient = dynamicImport(() => import('@/components/MenuPageClient'), {
  ssr: false,
  loading: () => (
    <main className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-semibold">Menu</h1>
      <p className="mt-4 text-sm text-neutral-400">Loading menu…</p>
    </main>
  ),
});

export default function MenuPage() {
  return <MenuPageClient />;
}
