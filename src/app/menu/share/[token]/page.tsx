'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type Row = { menu_name: string; served_on: string | null; item_name: string; price: number | null };

export default function PublicMenuPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);
      const { data, error } = await supabase.rpc('get_public_menu', { p_token: token });
      if (error) { setErr(error.message); setLoading(false); return; }
      setRows((data ?? []) as Row[]);
      setLoading(false);
    })();
  }, [token]);

  if (loading) return null;
  if (err) return <div className="p-6 text-red-500">{err}</div>;
  if (!rows.length) return <div className="p-6">Nothing found.</div>;

  const menuName = rows[0]?.menu_name ?? 'Menu';
  const servedOn = rows[0]?.served_on ?? '';

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white text-black">
      <div className="text-center mb-4">
        <h1 className="text-3xl font-bold">{menuName}</h1>
        {servedOn && <div className="text-sm">{new Date(servedOn).toLocaleDateString()}</div>}
        <button
          onClick={() => window.print()}
          className="mt-3 border rounded px-3 py-1 print:hidden"
        >
          Print
        </button>
      </div>

      <table className="w-full text-lg">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="py-2 pr-4">{r.item_name}</td>
              <td className="py-2 text-right">{r.price != null ? `$${Number(r.price).toFixed(2)}` : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <style>{`
        @media print {
          body { color: #000; background: #fff; }
          header, nav, .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}
