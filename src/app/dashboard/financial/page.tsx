import "server-only";
import DashboardControls from "../_components/DashboardControls";
import DefinitionsDrawer from "../_components/DefinitionsDrawer";
import { resolveRange } from "../_components/dateRange";

export default async function FinancialDashboard(props: any) {
  const sp = (await props?.searchParams) ?? props?.searchParams ?? {};
  const range = resolveRange(sp);

  const definitions = [
    { label: "Net Sales", formula: "SUM(total)" },
    { label: "Expenses", formula: "SUM(expenses.amount_usd)" },
    { label: "Profit", formula: "Net Sales - Expenses" },
    { label: "Food %", formula: "Food / Net Sales" },
    { label: "Labor %", formula: "Labor / Net Sales" },
    { label: "Prime %", formula: "(Food + Labor) / Net Sales" },
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
        <div className="font-semibold">Financial Dashboard</div>
        <div className="text-sm opacity-70 mt-2">
          Next step: prime cost view (Food + Labor), margin trend, and a simple P&amp;L style breakdown.
        </div>
      </div>
    </div>
  );
}
