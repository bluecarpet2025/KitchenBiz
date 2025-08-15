'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type SharePayload = {
  name: string;
  served_on: string | null;
  items: { name: string; price: number }[];
};

export default function PublicMenuPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token || '';
  const [payload, setPayload] = useState<SharePayload | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setStatus('Loading…');
      const { data, error } = await supabase.rpc('get_menu_share', { p_token: String(token) });
      if (error || !data) { setStatus('Menu not found'); return; }
      setPayload(data as SharePayload);
      setStatus(null);
    })();
  }, [token]);

  const printNow = () => window.print();

  return (
    <div className="mx-auto max-w-2xl p-6 space-y-4 bg-black text-white print:bg-white print:text-black">
      <div className="flex items-center justify-between print:hidden">
        <div className="text-sm opacity-80">Public menu</div>
        <button onClick={printNow} className="border rounded px-3 py-2">Print</button>
      </div>

      {status && <div className="opacity-80 text-sm">{status}</div>}

      {payload && (
        <div className="space-y-4">
          <div className="text-center">
            <h1 className="text-3xl font-bold">{payload.name}</h1>
            {payload.served_on && (
              <div className="text-sm opacity-80">{new Date(payload.served_on).toLocaleDateString()}</div>
            )}
          </div>

          <table className="w-full text-lg">
            <tbody>
              {payload.items.map((it, i) => (
                <tr key={i}>
                  <td className="py-2 pr-4">{it.name}</td>
                  <td className="py-2 text-right">{Number.isFinite(it.price) ? `$${it.price.toFixed(2)}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <style>{`
            @media print {
              header, nav, .print\\:hidden { display: none !important; }
              body { color: #000; background: #fff; }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
