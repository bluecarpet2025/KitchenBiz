'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Selections = Record<string, number>; // recipe_id -> price

export default function MenuSaves({
  selections,
  onLoad,
}: {
  selections: Selections;
  onLoad: (s: Selections) => void;
}) {
  const [list, setList] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setErr(null);
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) return;
      const { data: prof } = await supabase.from('profiles').select('tenant_id').eq('id', u.user.id).single();
      const t = prof?.tenant_id ?? null;
      setTenantId(t);
      if (!t) return;
      const { data } = await supabase
        .from('saved_menus')
        .select('id,name')
        .eq('tenant_id', t)
        .order('created_at', { ascending: false });
      setList(data ?? []);
    })();
  }, []);

  async function refresh() {
    if (!tenantId) return;
    const { data } = await supabase
      .from('saved_menus')
      .select('id,name')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    setList(data ?? []);
  }

  async function saveAs() {
    if (!tenantId) return;
    const name = prompt('Save menu as:');
    if (!name) return;
    setLoading(true);
    setErr(null);
    try {
      const items = Object.entries(selections).map(([recipe_id, price]) => ({ recipe_id, price }));
      const { error } = await supabase
        .from('saved_menus')
        .upsert({ tenant_id: tenantId, name, items }, { onConflict: 'tenant_id,name' });
      if (error) throw error;
      await refresh();
      alert('Saved!');
    } catch (e: any) {
      setErr(e.message || 'Save failed');
    } finally {
      setLoading(false);
    }
  }

  async function loadOne(id: string) {
    const { data, error } = await supabase.from('saved_menus').select('items').eq('id', id).single();
    if (error) return alert(error.message);
    const items: { recipe_id: string; price: number }[] = (data?.items ?? []) as any[];
    const map: Selections = Object.fromEntries(items.map((it) => [it.recipe_id, Number(it.price) || 0]));
    onLoad(map);
  }

  return (
    <div className="flex items-center gap-2">
      <button onClick={saveAs} disabled={loading || !tenantId} className="border rounded px-3 py-2 hover:bg-neutral-900">
        Save as…
      </button>

      <div className="relative inline-block">
        <details>
          <summary className="list-none border rounded px-3 py-2 hover:bg-neutral-900 cursor-pointer">
            Load…
          </summary>
          <div className="absolute z-10 mt-2 w-64 bg-black border rounded shadow">
            {list.length === 0 && <div className="px-3 py-2 text-sm text-neutral-400">No saved menus yet</div>}
            {list.map((m) => (
              <button
                key={m.id}
                onClick={() => loadOne(m.id)}
                className="block w-full text-left px-3 py-2 text-sm hover:bg-neutral-900"
              >
                {m.name}
              </button>
            ))}
          </div>
        </details>
      </div>

      {err && <span className="text-sm text-red-500">{err}</span>}
    </div>
  );
}
