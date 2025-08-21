'use client';
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { fmtUSD } from '@/lib/costing';

type LineRow = { recipe_id: string; servings: number; price: number };
type RecipeRow = { id: string; name: string | null };

function fmt(d?: string | null) {
  if (!d) return '';
  try { return new Date(d).toLocaleString(); } catch { return ''; }
}

export default function MenuPrintClientPage() {
  const sp = useSearchParams();
  const menuId = sp.get('menu_id') || '';

  const [title, setTitle] = useState<string>('Menu');
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [rows, setRows] = useState<{ name: string; servings: number; price: number; line: number }[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [grand, setGrand] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);

        const { data: u } = await supabase.auth.getUser();
        const uid = u.user?.id;
        if (!uid) { setStatus('Sign in required.'); setLoading(false); return; }

        const { data: prof } = await supabase
          .from('profiles').select('tenant_id').eq('id', uid).maybeSingle();
        const t = prof?.tenant_id ?? null;
        if (!t) { setStatus('No tenant.'); setLoading(false); return; }
        if (!menuId) { setStatus('Missing menu id.'); setLoading(false); return; }

        const { data: m } = await supabase
          .from('menus').select('id,name,created_at,tenant_id').eq('id', menuId).eq('tenant_id', t).maybeSingle();
        if (!m) { setStatus('Menu not found.'); setLoading(false); return; }
        setTitle(m.name || 'Menu'); setCreatedAt(m.created_at);

        const { data: lines } = await supabase
          .from('menu_recipes').select('recipe_id,servings,price').eq('menu_id', m.id);

        const ids = [...new Set((lines ?? []).map(l => l.recipe_id))];
        let names = new Map<string, string>();
        if (ids.length) {
          const { data: recs } = await supabase.from('recipes').select('id,name').in('id', ids);
          (recs ?? []).forEach((r: RecipeRow) => names.set(r.id, r.name ?? 'Untitled'));
        }

        const out = (lines ?? []).map((l: LineRow) => {
          const nm = names.get(l.recipe_id) ?? 'Untitled';
          const priceEach = Number(l.price ?? 0);
          const line = priceEach * Number(l.servings ?? 0);
          return { name: nm, servings: l.servings, price: priceEach, line };
        }).sort((a, b) => a.name.localeCompare(b.name));

        setRows(out);
        setGrand(out.reduce((s, r) => s + r.line, 0));
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
      <div className="flex items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          {createdAt && <p className="text-sm opacity-80">Created {fmt(createdAt)}</p>}
        </div>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            Print
          </button>
          <Link href="/menu" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">Back to Menu</Link>
        </div>
      </div>

      <section className="mt-6 border rounded-lg p-6">
        {loading ? (
          <p className="text-neutral-400">Loading…</p>
        ) : status ? (
          <p className="text-rose-400">{status}</p>
        ) : rows.length === 0 ? (
          <p className="text-neutral-400">No items.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="print:table-header-group bg-neutral-900/60">
              <tr>
                <th className="text-left p-2">Item</th>
                <th className="text-right p-2">Qty</th>
                <th className="text-right p-2">Price</th>
                <th className="text-right p-2">Line</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="p-2">{r.name}</td>
                  <td className="p-2 text-right tabular-nums">{r.servings}</td>
                  <td className="p-2 text-right tabular-nums">{fmtUSD(r.price)}</td>
                  <td className="p-2 text-right tabular-nums">{fmtUSD(r.line)}</td>
                </tr>
              ))}
              <tr className="border-t">
                <td className="p-2 font-medium" colSpan={3}>Total</td>
                <td className="p-2 text-right tabular-nums font-semibold">{fmtUSD(grand)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </section>

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
