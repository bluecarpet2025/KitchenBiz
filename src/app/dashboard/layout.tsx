import Link from "next/link";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="opacity-70 text-sm">
          Track performance using <strong>net sales</strong>, expenses, and margins.
        </p>
      </div>

      {/* Dashboard sub-nav */}
      <div className="mb-6 flex flex-wrap gap-2 border-b border-neutral-800 pb-3">
        <Link className="px-3 py-1 rounded border border-neutral-800 hover:bg-neutral-900" href="/dashboard/executive">
          Executive
        </Link>
        <Link className="px-3 py-1 rounded border border-neutral-800 hover:bg-neutral-900" href="/dashboard/financial">
          Financial
        </Link>
        <Link className="px-3 py-1 rounded border border-neutral-800 hover:bg-neutral-900" href="/dashboard/operational">
          Operational
        </Link>
      </div>

      {children}
    </main>
  );
}
