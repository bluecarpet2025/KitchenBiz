export const dynamic = 'force-dynamic'; // don't pre-render; always fetch

import { supabase } from '@/lib/supabase';

type SharedPayload = {
  title?: string;
  served_on?: string;
  items?: { name: string; price: number }[];
};

export default async function SharedMenuPage({
  params,
}: {
  params: { token: string };
}) {
  const token = params.token;

  // Call the RPC that returns the JSON payload (works without auth)
  const { data, error } = await supabase.rpc('get_shared_menu', {
    p_token: token,
  });

  // If RPC failed or no payload, show a clean 404-ish message
  if (error || !data) {
    return (
      <div className="max-w-3xl mx-auto py-10 space-y-4">
        <h1 className="text-2xl font-semibold">Menu not found</h1>
        <p className="opacity-75">
          This share link is invalid or has been revoked.
        </p>
      </div>
    );
  }

  const payload = data as SharedPayload;
  const title = payload.title ?? 'Menu';
  const servedOn = payload.served_on
    ? new Date(payload.served_on).toLocaleDateString()
    : '';

  return (
    <div className="max-w-3xl mx-auto py-10 space-y-6">
      <div className="text-center space-y-1">
        <h1 className="text-3xl font-bold">{title}</h1>
        {servedOn && <div className="text-sm opacity-75">{servedOn}</div>}
      </div>

      <table className="w-full text-lg">
        <tbody>
          {(payload.items ?? []).map((it, i) => (
            <tr key={i}>
              <td className="py-2 pr-4">{it.name}</td>
              <td className="py-2 text-right">
                {Number.isFinite(it.price) ? `$${Number(it.price).toFixed(2)}` : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="text-xs opacity-60 text-center">
        Read-only share. Prices shown were saved with the menu.
      </p>
    </div>
  );
}
