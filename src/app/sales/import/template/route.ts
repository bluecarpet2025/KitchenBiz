// src/app/sales/import/template/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  const headers = [
    "occurred_at",
    "source",
    "channel",
    "order_ref",
    "product_name",
    "qty",
    "unit_price",
  ];
  const sample = [
    ["2025-09-01","pos","dine-in","A1001","Cheese Pizza 14\"", "2","10.99"],
    ["2025-09-01","pos","dine-in","A1001","Soda (12oz can)","2","1.25"],
    ["2025-09-01","pos","takeout","B2001","Wings (10 pc)","1","12.00"],
  ];
  const body =
    headers.join(",") + "\n" +
    sample.map(r =>
      r.map(v => (typeof v === "string" && /[",\n]/.test(v) ? `"${v.replace(/"/g,'""')}"` : v)).join(",")
    ).join("\n");

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sales_template.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
