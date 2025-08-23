// src/components/RecipePriceBox.tsx
"use client";

import { fmtUSD, priceFromCost } from "@/lib/costing";
import { useMemo, useState } from "react";

type Props = {
  /** Raw cost per serving (already computed elsewhere) */
  baseCostPerServing: number;
  /** Slider default (as PERCENT 0..100). If omitted, 30% is used. */
  defaultTargetPct?: number;
};

export default function RecipePriceBox({ baseCostPerServing, defaultTargetPct = 30 }: Props) {
  // slider stores 0..100; convert to 0..1 for math
  const [targetPct, setTargetPct] = useState<number>(defaultTargetPct);

  const price = useMemo(() => {
    const pct = Math.max(1, Math.min(95, Math.round(targetPct))) / 100; // 0.01..0.95
    return priceFromCost(baseCostPerServing, pct);
  }, [baseCostPerServing, targetPct]);

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="text-xs uppercase opacity-70">cost / serving</div>
          <div className="text-xl font-semibold tabular-nums">{fmtUSD(baseCostPerServing)}</div>
        </div>
        <div className="text-right space-y-1">
          <div className="text-xs uppercase opacity-70">Suggested price</div>
          <div className="text-xl font-semibold tabular-nums">{fmtUSD(price)}</div>
          <div className="text-xs opacity-70">Target food cost: {Math.round(targetPct)}%</div>
        </div>
      </div>

      <div className="mt-4">
        <input
          type="range"
          min={5}
          max={95}
          step={1}
          value={targetPct}
          onChange={(e) => setTargetPct(Number(e.target.value))}
          className="w-full"
        />
        <div className="text-xs mt-1 opacity-70">
          Drag to set target food‑cost percentage ({Math.round(targetPct)}%)
        </div>
      </div>
    </div>
  );
}
