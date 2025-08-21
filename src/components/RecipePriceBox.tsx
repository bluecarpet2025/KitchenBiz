// src/components/RecipePriceBox.tsx
"use client";

import { fmtUSD, suggestedPrice } from "@/lib/costing";
import { useMemo, useState } from "react";

export default function RecipePriceBox(props: {
  baseCostPerServing: number;
  defaultMarginPct?: number; // default 30
}) {
  const { baseCostPerServing, defaultMarginPct = 30 } = props;
  const [margin, setMargin] = useState<number>(defaultMarginPct);

  const price = useMemo(
    () => suggestedPrice(baseCostPerServing, margin),
    [baseCostPerServing, margin]
  );

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="text-xs uppercase opacity-70">Cost / serving</div>
          <div className="text-xl font-semibold tabular-nums">
            {fmtUSD(baseCostPerServing)}
          </div>
        </div>
        <div className="space-y-1 text-right">
          <div className="text-xs uppercase opacity-70">Suggested price</div>
          <div className="text-xl font-semibold tabular-nums">
            {fmtUSD(price)}
          </div>
          <div className="text-xs opacity-70">Margin: {margin}%</div>
        </div>
      </div>

      <div className="mt-4">
        <input
          type="range"
          min={5}
          max={80}
          step={1}
          value={margin}
          onChange={(e) => setMargin(Number(e.target.value))}
          className="w-full"
        />
        <div className="text-xs mt-1 opacity-70">
          Drag to adjust target margin (5%–80%)
        </div>
      </div>
    </div>
  );
}
