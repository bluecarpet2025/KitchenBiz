"use client";
import { useState } from "react";

type Props = {
  itemId: string;
  itemName: string;
  baseUnit: string;
};

export default function AddReceiptButton({ itemId, itemName, baseUnit }: Props) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<number>(0);
  const [totalCost, setTotalCost] = useState<number>(0);
  const [exp, setExp] = useState<string>("");
  const [note, setNote] = useState<string>("");

  async function save() {
    if (!itemId || qty <= 0 || totalCost < 0) {
      alert("Enter a positive quantity and total cost.");
      return;
    }
    const res = await fetch("/inventory/receipts/new", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        item_id: itemId,
        qty_base: qty,
        total_cost_usd: totalCost,
        expires_on: exp || null,
        note: note || null,
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j?.error || "Failed to add receipt");
      return;
    }
    setOpen(false);
    location.reload();
  }

  return (
    <>
      <button
        className="px-2 py-1 border rounded hover:bg-neutral-900 text-xs"
        onClick={() => setOpen(true)}
      >
        Add receipt
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-neutral-950 border rounded-lg p-4 w-[420px] space-y-3">
            <div className="font-semibold">Add receipt</div>
            <div className="text-sm opacity-70">{itemName}</div>

            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                Qty ({baseUnit})
                <input
                  type="number"
                  step="0.0001"
                  min={0}
                  className="w-full mt-1 bg-black border rounded px-2 py-1"
                  value={qty}
                  onChange={(e) => setQty(Number(e.target.value))}
                />
              </label>
              <label className="text-sm">
                Total cost ($)
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  className="w-full mt-1 bg-black border rounded px-2 py-1"
                  value={totalCost}
                  onChange={(e) => setTotalCost(Number(e.target.value))}
                />
              </label>

              <label className="text-sm col-span-2">
                Expires on (optional)
                <input
                  type="date"
                  className="w-full mt-1 bg-black border rounded px-2 py-1"
                  value={exp}
                  onChange={(e) => setExp(e.target.value)}
                />
              </label>

              <label className="text-sm col-span-2">
                Note (optional)
                <input
                  type="text"
                  className="w-full mt-1 bg-black border rounded px-2 py-1"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button className="px-3 py-1 border rounded" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button className="px-3 py-1 bg-white text-black rounded" onClick={save}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
