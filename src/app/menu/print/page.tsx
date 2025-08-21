'use client';
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type LineRow = { recipe_id: string; servings: number };
type RecipeRow = { id: string; name: string | null };

function fmt(d?: string | null) {
  if (!d) return '';
  try { return new Date(d).toLocaleString(); } catch { return ''; }
}

export default function MenuPrintClientPage() {
  const sp = useSearchParams();
  const menuId = sp.get('menu_id') || '';

  const [tenantId, setTenantId] = useState<string | null>(null);
  const [title, setTitle] = useState<string>('Menu');
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [rows, setRows] = useState<{ name: string; servings: number }[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load using browser session (no server rendering)
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);

        // Require a session
        const { data: u, error: uErr } = await supabase.auth.getUser();
        if (uErr) throw uErr;
        const uid = u?.user?.id;
        if (!uid) { setStatus('Sign in required.'); setLoading(false); return; }

        // tenant
        const { data: prof, error: pErr } = await supabase
          .from('profiles')
          .select('tenant_id')
          .eq('id', uid)
          .maybeSingle();
        if (pErr) throw pErr;
        const t = prof?.tenant_id ?? null;
        setTenantId(t);
        if (!t) { setStatus('No tenant.'); setLoading(false); return; }

        if (!menuId) { setStatus('Missing menu id.'); setLoading(false); return; }

        // menu (scoped to tenant)
        const { data: m, error: mErr } = await supabase
          .from('menus')
          .select('id,name,created_at,tenant_id')
          .eq('id', menuId)
          .eq('tenant_id', t)
          .maybeSingle();
        if (mErr) throw mErr;
        if (!m) { setStatus('Menu not found.'); setLoading(false); return; }
        setTitle(m.name || 'Menu');
        setCreatedAt(m.created_at);

        // lines
        const { data: lines, error: lErr } = await supabase
          .from('menu_recipes')
          .select('recipe_id,servings')
          .eq('menu_id', m.id);
        if (lErr) throw lErr;

        const ids = [...new Set((lines ?? []).map(l => l.recipe_id))];
        let nameById = new Map<string, string>();
        if (ids.length) {
          const { data: recs, error: rErr } = await supabase
            .from('recipes')
            .select('id,name')
            .in('id', ids);
          if (rErr) throw rErr;
          (recs ?? []).forEach((r: RecipeRow) => nameById.set(r.id, r.name ?? 'Untitled'));
        }

        const out = (lines ?? [])
          .map((l: LineRow) => ({
            name: nameById.get(l.recipe_id) ?? 'Untitled',
            servings: l.servings
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        setRows(out);
        setStatus(null);
      } catch (e: any) {
        setStatus(e?.message ?? 'Error loading print view.');
      } finally {
        setLoading(false);
      }
    })();
  }, [menuId]);

  return (
    <main className="mx-auto p-8 max-w-3xl">
      {/* Header (hidden when printing) */}
      <div className="flex items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          {createdAt && <p className="text-sm opacity-80">Created {fmt(createdAt)}</p>}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
          >
            Print
          </button>
          <Link href="/menu" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            Back to Menu
          </Link>
        </div>
      </div>

      {/* Body */}
      <section className="mt-6 border rounded-lg p-6">
        {loading ? (
          <p className="text-neutral-400">Loading…</p>
        ) : status ? (
          <p className="text-red-400">{status}</p>
        ) : rows.length === 0 ? (
          <p className="text-neutral-400">No recipes in this menu.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="print:table-header-group bg-neutral-900/60">
              <tr>
                <th className="text-left p-2">Recipe</th>
                <th className="text-right p-2">Portions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="p-2">{r.name}</td>
                  <td className="p-2 text-right tabular-nums">{r.servings}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Print-only tweaks */}
      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
          main { padding: 0 !important; }
          section { border: none !important; }
          table { page-break-inside: avoid; }
        }
      `}</style>
    </main>
  );
}
