import "server-only";
import DashboardControls from "../_components/DashboardControls";
import DefinitionsDrawer from "../_components/DefinitionsDrawer";
import { resolveRange } from "../_components/dateRange";

export default async function OperationalDashboard({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const range = resolveRange(searchParams);

  const definitions = [
    { label: "Top Items", formula: "SUM(net_sales) grouped by product_id", note: "Requires product_id (your demo currently has null)." },
    { label: "AOV", formula: "Net Sales / Orders" },
  ];

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="text-sm opacity-70">
          Range: <strong>{range.start}</strong> → <strong>{range.end}</strong> (end exclusive)
        </div>
        <DefinitionsDrawer items={definitions} />
      </div>

      <DashboardControls />

      <div className="rounded border border-neutral-800 p-4">
        <div className="font-semibold">Operational Dashboard</div>
        <div className="text-sm opacity-70 mt-2">
          This page will include Top/Bottom items, menu mix, and order/channel insights.  
          Your note is correct: demo data has <code>product_id</code> = NULL, so we’ll add products + backfill next.
        </div>
      </div>
    </div>
  );
}
