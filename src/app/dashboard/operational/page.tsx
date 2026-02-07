import "server-only";
import DashboardControls from "../_components/DashboardControls";
import DefinitionsDrawer from "../_components/DefinitionsDrawer";
import KpiCard from "../_components/KpiCard";
import { resolveRange } from "../_components/dateRange";
import { createServerClient } from "@/lib/supabase/server";
import { WeekdayBars } from "../_components/Charts";

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(Number(n) || 0);

function clamp2(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function toWeekdayLabel(isoDate: string) {
  const d = new Date(`${isoDate}T00:00:00`);
  const idx = d.getDay(); // 0=Sun..6=Sat
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][idx] ?? "—";
}

function daysBetween(aISO: string, bISO: string) {
  const a = new Date(`${aISO}T00:00:00`).getTime();
  const b = new Date(`${bISO}T00:00:00`).getTime();
  const ms = b - a;
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export default async function OperationalDashboard(props: any) {
  const sp = (await props?.searchParams) ?? props?.searchParams ?? {};
  const range = resolveRange(sp);
  const supabase = await createServerClient();

  // --- Inventory dashboard view
  const { data: invRows, error: invErr } = await supabase
    .from("v_inventory_dashboard")
    .select("item_id, name, on_hand_base, on_hand_value_usd, expires_soon")
    .order("on_hand_value_usd", { ascending: false });

  if (invErr) {
    return (
      <div className="rounded border border-red-900/60 p-4">
        <div className="font-semibold">Dashboard query error</div>
        <div className="text-sm opacity-80 mt-1">{invErr.message}</div>
      </div>
    );
  }

  const itemsTotal = (invRows ?? []).length;
  const totalOnHandValue = (invRows ?? []).reduce((a: number, r: any) => a + Number(r.on_hand_value_usd || 0), 0);

  // Expiring soon thresholds
  const EXP_7_DAYS = 7;
  const EXP_30_DAYS = 30;
  const todayISO = new Date().toISOString().slice(0, 10);

  const exp7 = (invRows ?? []).filter((r: any) => {
    const exp = String(r.expires_soon ?? "").slice(0, 10);
    if (!exp) return false;
    const d = daysBetween(todayISO, exp);
    return d >= 0 && d <= EXP_7_DAYS;
  });

  const exp30 = (invRows ?? []).filter((r: any) => {
    const exp = String(r.expires_soon ?? "").slice(0, 10);
    if (!exp) return false;
    const d = daysBetween(todayISO, exp);
    return d >= 0 && d <= EXP_30_DAYS;
  });

  // --- Purchasing (receipts) within selected range
  const { data: receipts, error: recErr } = await supabase
    .from("inventory_receipts")
    .select("created_at, total_cost_usd, qty_base")
    .order("created_at", { ascending: true });

  if (recErr) {
    return (
      <div className="rounded border border-red-900/60 p-4">
        <div className="font-semibold">Dashboard query error</div>
        <div className="text-sm opacity-80 mt-1">{recErr.message}</div>
      </div>
    );
  }

  const recRows = (receipts ?? []).filter((r: any) => {
    const day = String(r.created_at ?? "").slice(0, 10);
    return day && day >= range.start && day < range.end;
  });

  const purchaseSpend = recRows.reduce((a: number, r: any) => a + Number(r.total_cost_usd || 0), 0);
  const purchaseLines = recRows.length;
  const purchaseQtyBase = recRows.reduce((a: number, r: any) => a + Number(r.qty_base || 0), 0);

  // Purchasing by weekday (spend)
  const weekdayTotals = new Map<string, number>();
  for (const r of recRows as any[]) {
    const day = String(r.created_at ?? "").slice(0, 10);
    const wd = toWeekdayLabel(day);
    weekdayTotals.set(wd, (weekdayTotals.get(wd) || 0) + Number(r.total_cost_usd || 0));
  }
  const weekdayOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const weekdayPurchase = weekdayOrder.map((wd) => ({
    name: wd,
    value: clamp2(weekdayTotals.get(wd) || 0),
  }));

  // Top on-hand value items (list)
  const topOnHand = (invRows ?? []).slice(0, 8).map((r: any) => ({
    name: String(r.name ?? "—"),
    value: Number(r.on_hand_value_usd || 0),
    qty: Number(r.on_hand_base || 0),
  }));

  // Expiring soon list (7-day)
  const expSoonList = exp7
    .slice()
    .sort((a: any, b: any) => String(a.expires_soon ?? "").localeCompare(String(b.expires_soon ?? "")))
    .slice(0, 10)
    .map((r: any) => ({
      name: String(r.name ?? "—"),
      exp: String(r.expires_soon ?? "").slice(0, 10),
      value: Number(r.on_hand_value_usd || 0),
    }));

  // --- NEW: Recent inventory counts (variance)
  const { data: recentCounts, error: cntErr } = await supabase
    .from("v_recent_counts")
    .select("count_id, created_at, total_counted_units, total_counted_value_usd, total_change_units, total_change_value_usd")
    .order("created_at", { ascending: false })
    .limit(8);

  // If this errors, we don't hard-fail the whole dashboard; it's a guardrail panel.
  const countsSafe = cntErr ? [] : (recentCounts ?? []);

  // --- NEW: Makeable recipes (now)
  // v_recipe_makeable_simple provides recipe_id + makeable. Join recipe names via recipes table.
  const { data: makeableRows, error: makeErr } = await supabase
    .from("v_recipe_makeable_simple")
    .select("recipe_id, makeable")
    .order("makeable", { ascending: false })
    .limit(30);

  let makeableList: Array<{ name: string; makeable: number }> = [];
  if (!makeErr && (makeableRows ?? []).length) {
    const ids = Array.from(new Set((makeableRows ?? []).map((r: any) => r.recipe_id))).filter(Boolean);
    const { data: recipeRows } = await supabase
      .from("recipes")
      .select("id, name")
      .in("id", ids);

    const nameMap = new Map<string, string>();
    for (const r of recipeRows ?? []) nameMap.set(String((r as any).id), String((r as any).name ?? "—"));

    makeableList = (makeableRows ?? [])
      .map((r: any) => ({
        name: nameMap.get(String(r.recipe_id)) ?? "—",
        makeable: Number(r.makeable || 0),
      }))
      .filter((r) => r.makeable > 0)
      .slice(0, 10);
  }

  const definitions = [
    {
      label: "On-hand value",
      formula: "on_hand_base * avg_unit_cost",
      note: "Based on receipts (avg unit cost) and current on-hand quantity.",
    },
    {
      label: "On-hand quantity (base)",
      formula: "SUM(receipts.qty_base) + SUM(adjustments.delta_base)",
      note: "Receipts add inventory; adjustments change inventory.",
    },
    {
      label: `Expiring soon (7 days)`,
      formula: `expires_on within ${EXP_7_DAYS} days`,
      note: "Uses the nearest expiry date per item.",
    },
    {
      label: `Expiring soon (30 days)`,
      formula: `expires_on within ${EXP_30_DAYS} days`,
    },
    {
      label: "Purchasing (Spend)",
      formula: "SUM(inventory_receipts.total_cost_usd)",
      note: "Total purchase spend in the selected range.",
    },
    {
      label: "Purchase lines",
      formula: "COUNT(inventory_receipts.id)",
      note: "How many receipt lines were entered in the selected range.",
    },
    {
      label: "Purchase quantity (base)",
      formula: "SUM(inventory_receipts.qty_base)",
    },
    {
      label: "Recent inventory counts (variance)",
      formula: "From v_recent_counts: total_change_units/value summarize count adjustments",
      note: "Useful for spotting shrink, miscounts, or process issues.",
    },
    {
      label: "Makeable recipes (now)",
      formula: "From v_recipe_makeable_simple: floor(on_hand / req_per_batch) per ingredient, min across ingredients",
      note: "Shows how many full batches you can make today based on inventory.",
    },
    {
      label: "Future: Top items / menu mix",
      formula: "SUM(net sales) grouped by product",
      note:
        "We can build this once we have product_id on sales_order_lines (or a product mapping). Demo data currently has product_id NULL.",
    },
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

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KpiCard
          label="Inventory Value (On-hand)"
          value={fmtCurrency(totalOnHandValue)}
          hint="Total value of current inventory on hand."
          formula="SUM(on_hand_base * avg_unit_cost)"
        />
        <KpiCard
          label="Items Tracked"
          value={String(itemsTotal)}
          hint="How many items exist in inventory."
          formula="COUNT(inventory_items)"
        />
        <KpiCard
          label={`Expiring ≤ ${EXP_7_DAYS} days`}
          value={String(exp7.length)}
          hint="Items with nearest expiry within 7 days."
          formula={`expires_on within ${EXP_7_DAYS} days`}
        />
        <KpiCard
          label={`Expiring ≤ ${EXP_30_DAYS} days`}
          value={String(exp30.length)}
          hint="Items with nearest expiry within 30 days."
          formula={`expires_on within ${EXP_30_DAYS} days`}
        />
        <KpiCard
          label="Purchasing Spend"
          value={fmtCurrency(purchaseSpend)}
          hint="Total inventory receipt spend in this range."
          formula="SUM(inventory_receipts.total_cost_usd)"
        />
        <KpiCard
          label="Purchase Lines"
          value={String(purchaseLines)}
          hint="How many receipt lines were entered."
          formula="COUNT(inventory_receipts.id)"
        />
        <KpiCard
          label="Purchase Qty (base)"
          value={clamp2(purchaseQtyBase).toLocaleString()}
          hint="Total purchased quantity in base units."
          formula="SUM(inventory_receipts.qty_base)"
        />
        <KpiCard
          label="Focus"
          value={"Inventory & Freshness"}
          hint="Operational dashboard focuses on stock, purchases, and waste prevention."
        />
      </div>

      {/* Charts + lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded border border-neutral-800 p-4">
          <div className="font-semibold mb-2">Purchasing Spend by Weekday</div>
          <div className="text-sm opacity-70 mb-4">Shows which days you tend to restock.</div>
          <WeekdayBars data={weekdayPurchase} />
        </div>

        <div className="rounded border border-neutral-800 p-4">
          <div className="font-semibold mb-2">Top Inventory Value (On-hand)</div>
          <div className="text-sm opacity-70 mb-4">
            Your highest-value items on hand right now (helpful for shrink/waste focus).
          </div>
          <div className="space-y-2">
            {topOnHand.length ? (
              topOnHand.map((r, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-3 rounded border border-neutral-800 bg-neutral-950/40 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{r.name}</div>
                    <div className="text-xs opacity-70">Qty (base): {clamp2(r.qty).toLocaleString()}</div>
                  </div>
                  <div className="font-semibold">{fmtCurrency(r.value)}</div>
                </div>
              ))
            ) : (
              <div className="text-sm opacity-70">No inventory data yet.</div>
            )}
          </div>
        </div>

        {/* NEW: Recent inventory counts */}
        <div className="rounded border border-neutral-800 p-4 lg:col-span-2">
          <div className="font-semibold mb-2">Recent Inventory Counts (variance)</div>
          <div className="text-sm opacity-70 mb-4">
            Quick guardrail: large variance can indicate shrink, miscounts, or a process issue.
          </div>

          {cntErr ? (
            <div className="text-sm opacity-70">Counts panel unavailable: {cntErr.message}</div>
          ) : countsSafe.length ? (
            <div className="space-y-2">
              {countsSafe.map((c: any, idx: number) => (
                <div
                  key={idx}
                  className="rounded border border-neutral-800 bg-neutral-950/40 px-3 py-2 flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      {String(c.created_at ?? "").slice(0, 10)} • Count #{String(c.count_id).slice(0, 8)}
                    </div>
                    <div className="text-xs opacity-70">
                      Change Units: {clamp2(Number(c.total_change_units || 0)).toLocaleString()} • Change Value:{" "}
                      {fmtCurrency(Number(c.total_change_value_usd || 0))}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-sm opacity-80">Counted Value</div>
                    <div className="font-semibold">{fmtCurrency(Number(c.total_counted_value_usd || 0))}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm opacity-70">No counts yet.</div>
          )}
        </div>

        {/* NEW: Makeable recipes */}
        <div className="rounded border border-neutral-800 p-4 lg:col-span-2">
          <div className="font-semibold mb-2">Makeable Recipes (right now)</div>
          <div className="text-sm opacity-70 mb-4">
            Based on current inventory. Helps decide what you can produce today without running out.
          </div>

          {makeErr ? (
            <div className="text-sm opacity-70">Makeable panel unavailable: {makeErr.message}</div>
          ) : makeableList.length ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {makeableList.map((r, idx) => (
                <div key={idx} className="rounded border border-neutral-800 bg-neutral-950/40 p-3">
                  <div className="font-medium">{r.name}</div>
                  <div className="text-sm opacity-80 mt-1">
                    Makeable batches: <strong>{Number(r.makeable).toLocaleString()}</strong>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm opacity-70">No makeable recipe data yet.</div>
          )}
        </div>

        {/* Expiring soon list */}
        <div className="rounded border border-neutral-800 p-4 lg:col-span-2">
          <div className="font-semibold mb-2">{`Expiring Soon (≤ ${EXP_7_DAYS} days)`}</div>
          <div className="text-sm opacity-70 mb-4">
            These items are at higher risk of waste. Consider specials or prep planning.
          </div>

          {expSoonList.length ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {expSoonList.map((r, idx) => (
                <div key={idx} className="rounded border border-neutral-800 bg-neutral-950/40 p-3">
                  <div className="font-medium">{r.name}</div>
                  <div className="text-sm opacity-80 mt-1">
                    Expiry: <strong>{r.exp}</strong>
                  </div>
                  <div className="text-sm opacity-70 mt-1">On-hand value: {fmtCurrency(r.value)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm opacity-70">No items expiring within the next 7 days.</div>
          )}
        </div>
      </div>
    </div>
  );
}
