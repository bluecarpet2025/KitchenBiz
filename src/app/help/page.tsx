export const dynamic = "force-dynamic";

export default function Help() {
  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Help & FAQ</h1>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">How do I get Makeable > 0?</h2>
        <p className="text-sm text-neutral-300">
          Record a <a className="underline" href="/inventory/purchase">Purchase</a> or commit a{" "}
          <a className="underline" href="/inventory/counts/new">Count</a>. Makeable uses the
          stock-on-hand ledger from those transactions.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Daily counts</h2>
        <p className="text-sm text-neutral-300">
          Enter your physical counts and press <em>Commit</em>. Differences are saved as adjustments
          (loss/overage) so your on-hand matches reality.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Coming soon</h2>
        <ul className="list-disc ml-6 text-sm text-neutral-300 space-y-1">
          <li>Prep printable</li>
          <li>Google Sheets import/sync</li>
          <li>Vendor tracking & purchase costs</li>
        </ul>
      </section>
    </main>
  );
}
