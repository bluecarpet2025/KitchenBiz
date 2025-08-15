'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Item = {
  id: string; name: string;
  base_unit: string; purchase_unit: string;
  pack_to_base_factor: number | null;
  last_price: number | null;
};
type Recipe = {
  id: string; name: string;
  batch_yield_qty: number | null; batch_yield_unit: string | null; yield_pct: number | null;
};

function download(filename: string, text: string, mime = 'text/csv') {
  const blob = new Blob([text], { type: mime + ';charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
  a.remove();
}

export default function ToolsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setStatus('Loading…');
      const { data: its } = await supabase
        .from('inventory_items')
        .select('id,name,base_unit,purchase_unit,pack_to_base_factor,last_price')
        .order('name');
      setItems((its ?? []) as Item[]);

      const { data: recs } = await supabase
        .from('recipes')
        .select('id,name,batch_yield_qty,batch_yield_unit,yield_pct')
        .order('name');
      setRecipes((recs ?? []) as Recipe[]);
      setStatus(null);
    })();
  }, []);

  function exportInventoryCSV() {
    const headers = ['name','base_unit','purchase_unit','pack_to_base_factor','last_price'];
    const lines = [headers.join(',')];
    for (const it of items) {
      const row = [
        it.name,
        it.base_unit,
        it.purchase_unit,
        it.pack_to_base_factor ?? '',
        (it.last_price ?? '') as any,
      ]
      .map(val => `"${String(val).replace(/"/g, '""')}"`)
      .join(',');
      lines.push(row);
    }
    download('inventory.csv', lines.join('\n'));
  }

  function exportRecipesCSV() {
    const headers = ['name','batch_yield_qty','batch_yield_unit','yield_pct'];
    const lines = [headers.join(',')];
    for (const r of recipes) {
      const row = [
        r.name,
        r.batch_yield_qty ?? '',
        r.batch_yield_unit ?? '',
        r.yield_pct ?? '',
      ]
      .map(val => `"${String(val).replace(/"/g, '""')}"`)
      .join(',');
      lines.push(row);
    }
    download('recipes.csv', lines.join('\n'));
  }

  function downloadInventoryTemplate() {
    const headers = ['name','base_unit','purchase_unit','pack_to_base_factor','last_price'];
    const example = [
      ['Flour', 'g', 'kg', '1000', '1.20'],
      ['Tomato Sauce', 'g', 'kg', '1000', '2.40'],
      ['Mozzarella', 'g', 'kg', '1000', '5.00'],
      ['Pepperoni', 'g', 'kg', '1000', '7.50'],
      ['Soda (12oz)', 'ml', 'case(12x355ml)', '4260', '6.99'],
    ];
    const lines = [headers.join(','), ...example.map(r => r.map(v => `"${v}"`).join(','))];
    download('inventory_template.csv', lines.join('\n'));
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Tools</h1>
      {status && <div className="text-sm opacity-80">{status}</div>}

      <div className="grid md:grid-cols-2 gap-6">
        <div className="border rounded p-4 space-y-3">
          <h2 className="font-semibold">Inventory CSV</h2>
          <p className="text-sm opacity-75">Download your current inventory, or grab a template to fill and import.</p>
          <div className="flex gap-2">
            <button onClick={exportInventoryCSV} className="border rounded px-3 py-2">Export inventory.csv</button>
            <button onClick={downloadInventoryTemplate} className="border rounded px-3 py-2">Download template</button>
          </div>
        </div>

        <div className="border rounded p-4 space-y-3">
          <h2 className="font-semibold">Recipes CSV</h2>
          <p className="text-sm opacity-75">Export a simple list of your recipes with yields.</p>
          <button onClick={exportRecipesCSV} className="border rounded px-3 py-2">Export recipes.csv</button>
        </div>
      </div>
    </div>
  );
}
