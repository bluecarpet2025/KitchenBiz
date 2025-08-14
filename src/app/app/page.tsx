'use client';
import Link from 'next/link';

export default function Landing() {
  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-3xl font-semibold">Run your kitchen with clarity.</h1>
      <p className="text-neutral-300">
        Track inventory, cost recipes per serving, and price today’s menu in minutes.
        This MVP focuses on speed and ease of use.
      </p>
      <ul className="list-disc list-inside text-sm space-y-1 text-neutral-200">
        <li>Inventory: add items, inline price edits, unit costs</li>
        <li>Recipes: wizard + per-serving costs</li>
        <li>Menu: cost-based suggestions, % slider, rounding, print</li>
      </ul>
      <div className="flex gap-3">
        <Link href="/login" className="bg-white text-black font-medium rounded px-4 py-2">
          Sign in
        </Link>
        <span className="text-sm opacity-70">Access is invite-only for now.</span>
      </div>
    </div>
  );
}
