'use client';
import Link from 'next/link';

export default function Landing() {
  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-3xl font-semibold">Run your kitchen with clarity.</h1>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="border rounded p-4">
          <h2 className="font-semibold mb-2">What this does</h2>
          <ul className="list-disc list-inside text-sm space-y-1">
            <li>Track inventory and unit costs</li>
            <li>Build recipes with per-serving costs</li>
            <li>Create a daily menu with suggested prices</li>
            <li>Print or save the menu as PDF</li>
          </ul>
        </section>

        <section className="border rounded p-4">
          <h2 className="font-semibold mb-2">What’s available now</h2>
          <ul className="list-disc list-inside text-sm space-y-1">
            <li>Inventory: add/edit items, inline price edits</li>
            <li>Recipes: wizard + detail view, auto cost calcs</li>
            <li>Menu: % slider, rounding, save/load</li>
          </ul>
        </section>

        <section className="border rounded p-4">
          <h2 className="font-semibold mb-2">Coming next (hints)</h2>
          <ul className="list-disc list-inside text-sm space-y-1">
            <li>CSV tools & faster imports</li>
            <li>Staff roles & permissions</li>
            <li>Vendor & purchase tracking (optional)</li>
          </ul>
        </section>

        <section className="border rounded p-4">
          <h2 className="font-semibold mb-2">Access</h2>
          <p className="text-sm">Invite-only during MVP. Use your email’s magic link to sign in.</p>
          <div className="mt-3">
            <Link href="/login" className="bg-white text-black font-medium rounded px-4 py-2">
              Sign in
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
