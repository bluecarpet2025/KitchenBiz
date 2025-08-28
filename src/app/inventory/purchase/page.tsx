import Link from "next/link";
import ReceiptCsvTools from "@/components/ReceiptCsvTools";

export const dynamic = "force-dynamic";

export default async function NewPurchasePage() {
  return (
    <main className="max-w-5xl mx-auto p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">New Purchase</h1>
        {/* CSV tools: stays on-page, no redirect, 15s auto-hide */}
        <ReceiptCsvTools autoHideMs={15000} />
      </div>

      {/* The rest of your manual entry form stays unchanged */}
      <p className="text-sm opacity-70">
        Purchase date and optional note apply to all lines below.
      </p>

      {/* ... your existing form markup ... */}
      <div>
        <Link href="/inventory" className="underline">
          Back to Inventory
        </Link>
      </div>
    </main>
  );
}
