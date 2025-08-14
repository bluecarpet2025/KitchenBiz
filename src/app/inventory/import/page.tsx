'use client';
import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';

type Row = {
  name: string; base_unit: string; purchase_unit: string;
  pack_to_base_factor: number; last_price: number;
};

const REQUIRED_HEADERS = ['name','base_unit','purchase_unit','pack_to_base_factor','last_price'] as const;

function parseCSV(text: string): Row[] {
  const lines = text.replace(/\r/g, '').split('\n').filter(Boolean);
  if (!lines.length) return [];
  const header = lines[0].split(',').map(h => h.trim());
  const idx = (h: string) => header.findIndex(x => x === h);
  for (const h of REQUIRED_HEADERS) if (idx(h) === -1) throw new Error(`Missing header: ${h}`);

  const out: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]; if (!line) continue;
    const cells: string[] = [];
    let cur = '', inQ = false;
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === '"') { if (inQ && line[c+1] === '"') { cur += '"'; c++; } else inQ = !inQ; }
      else if (ch === ',' && !inQ) { cells.push(cur); cur = ''; }
      else cur += ch;
    }
    cells.push(cur);
    if (cells.every(x => x.trim() === '')) continue;
    const get = (h: string) => (cells[idx(h)] ?? '').trim();
    out.push({
      name: get('name'),
      base_unit: get('base_unit'),
      purchase_unit: get('purchase_unit'),
      pack_to_base_factor: Number(get('pack_to_base_factor') || 0),
      last_price: Number(get('last_price') || 0),
    });
  }
  return out;
}

const TEMPLATE = `name,base_unit,purchase_unit,pack_to_base_factor,last_price
Flour (00),g,kg,1000,0.70
Water,ml,l,1000,0.50
Mozzarella,g,kg,1000,7.00
`;

export default function ImportInventory() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id; if (!uid) return setErr('Not signed in.');
      const { data: prof, error } = await supabase.from('profiles').select('tenant_id').eq('id', uid).maybeSingle();
      if (error || !prof?.tenant_id) return setErr(error?.message || 'No tenant. Visit /app to initialize.');
      setTenantId(prof.tenant_id);
    })();
  }, []);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setErr(null); setOk(null);
    f.text().then(t => setRows(parseCSV(t))).catch(e => setErr(String(e)));
  }

  function triggerFile() { fileRef.current?.click(); }

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'inventory-template.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  async function importNow() {
    if (!tenantId) return setErr('No tenant.');
    if (!rows.length) return setErr('Nothing to import.');
    setBusy(true); setErr(null); setOk(null);

    const bad = rows.find(r => !r.name || !r.base_unit || !r.purchase_unit || !r.pack_to_base_factor);
    if (bad) { setBusy(false); return setErr('Some rows are missing required fields.'); }

    const payload = rows.map(r => ({
      tenant_id: tenantId,
      name: r.name,
      base_unit: r.base_unit,
      purchase_unit: r.purchase_unit,
      pack_to_base_factor: Number(r.pack_to_base_factor),
      last_price: Number(r.last_price || 0),
    }));

    const { error } = await supabase.from('inventory_items').insert(payload);
    setBusy(false);
    if (error) setErr(error.message);
    else { setOk(`Imported ${rows.length} items ✅`); setRows([]); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-4">
          <h1 className="text-2xl font-semibold">Import Inventory</h1>
          <a className="underline text-sm" href="/inventory">← Back</a>
        </div>
        <div className="flex gap-2">
          <button onClick={downloadTemplate} className="text-sm border rounded px-3 py-2 hover:bg-neutral-900">
            Download template
          </button>
          <button onClick={triggerFile} className="text-sm border rounded px-3 py-2 hover:bg-neutral-900">
            Choose CSV…
          </button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFileChange} className="hidden" />
        </div>
      </div>

      {err && <p className="text-red-500">{err}</p>}
      {ok && <p className="text-green-500">{ok}</p>}

      {rows.length > 0 && (
        <>
          <div className="text-sm">{rows.length} rows parsed. Preview (up to 20):</div>
          <table className="w-full text-sm table-auto border-separate border-spacing-y-1">
            <thead>
              <tr className="text-left text-neutral-300">
                <th className="px-3 py-2">Name</th><th className="px-3 py-2">Base</th>
                <th className="px-3 py-2">Purchase</th><th className="px-3 py-2">Pack→Base</th>
                <th className="px-3 py-2">Last Price</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 20).map((r, i) => (
                <tr key={i} className="bg-neutral-950/60 rounded">
                  <td className="px-3 py-2 rounded-l">{r.name}</td>
                  <td className="px-3 py-2">{r.base_unit}</td>
                  <td className="px-3 py-2">{r.purchase_unit}</td>
                  <td className="px-3 py-2">{r.pack_to_base_factor}</td>
                  <td className="px-3 py-2 rounded-r">${Number(r.last_price || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <button disabled={busy} onClick={importNow} className="bg-white text-black font-medium rounded px-4 py-2">
            {busy ? 'Importing…' : 'Import all'}
          </button>
        </>
      )}
    </div>
  );
}
