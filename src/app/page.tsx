export default function Home() {
  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-semibold">Kitchen Biz</h1>
      <p className="text-sm text-neutral-300">
        Simple back-of-house for small restaurants: inventory, recipes, and menu costing.
      </p>

      <div className="grid sm:grid-cols-3 gap-3">
        <a href="/inventory" className="border rounded-lg p-4 hover:bg-neutral-900 block">
          <h2 className="font-medium">Inventory →</h2>
          <p className="text-xs text-neutral-400 mt-1">
            Track items, purchases, and daily counts. Inline pricing with $/base auto-calc.
          </p>
        </a>
        <a href="/recipes" className="border rounded-lg p-4 hover:bg-neutral-900 block">
          <h2 className="font-medium">Recipes →</h2>
          <p className="text-xs text-neutral-400 mt-1">
            Per-serving costs and “Makeable” based on stock on hand.
          </p>
        </a>
        <a href="/menu" className="border rounded-lg p-4 hover:bg-neutral-900 block">
          <h2 className="font-medium">Menu →</h2>
          <p className="text-xs text-neutral-400 mt-1">
            Build menus, save/load, share read-only links, print.
          </p>
        </a>
      </div>

      <section className="space-y-2">
        <h3 className="text-lg font-medium">Roadmap</h3>
        <ul className="list-disc ml-6 text-sm text-neutral-300 space-y-1">
          <li>Prep printable sheet</li>
          <li>Import templates & Google Sheets sync</li>
          <li>Staff roles & vendors</li>
          <li>Polish & empty states</li>
        </ul>
      </section>

      <p className="text-sm text-neutral-400">
        Need a hand? Read the <a href="/help" className="underline">help/FAQ</a>.
      </p>
    </main>
  );
}
