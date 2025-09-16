import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import ImportButton from './ImportButton';
import { getEffectiveTenant } from '@/lib/effective-tenant';

export const dynamic = 'force-dynamic';

export default async function ReceiptsListPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Receipts</h1>
        <p className="mt-4">Sign in required.</p>
        <Link className="underline" href="/login?redirect=/inventory/receipts">Go to login</Link>
      </main>
    );
  }

  const tenantId = await getEffectiveTenant(supabase);
  if (!tenantId) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Receipts</h1>
        <p className="mt-4">Profile missing tenant.</p>
      </main>
    );
  }

  const { data: rows, error } = await supabase
    .from('v_receipt_docs')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('purchased_at', { ascending: false });
  if (error) console.error(error);

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Receipts</h1>
        <div className="flex items-center gap-2">
          <ImportButton tenantId={tenantId} />
          <Link href="/inventory/receipts/new" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            New Purchase
          </Link>
          <a href="/api/import/template?type=receipts" className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900">
            Download template
          </a>
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900/60">
            <tr>
              <th className="p-2 text-left">Date</th>
              <th className="p-2 text-left">Vendor</th>
              <th className="p-2 text-left">Note</th>
              <th className="p-2 text-right">Lines</th>
              <th className="p-2 text-right">Total</th>
              <th className="p-2">Photo</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r: any) => (
              <tr key={r.id} className="border-t">
                <td className="p-2">{new Date(r.purchased_at).toLocaleDateString()}</td>
                <td className="p-2">{r.vendor || '—'}</td>
                <td className="p-2">{r.note || '—'}</td>
                <td className="p-2 text-right">{r.line_count}</td>
                <td className="p-2 text-right">${Number(r.total ?? 0).toFixed(2)}</td>
                <td className="p-2 text-center">{r.photo_url ? '📷' : '—'}</td>
                <td className="p-2">
                  <Link href={`/inventory/receipts/${r.id}`} className="underline text-sm">Open</Link>
                </td>
              </tr>
            ))}
            {(rows ?? []).length === 0 && (
              <tr><td className="p-3 text-neutral-400" colSpan={7}>No receipts yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
