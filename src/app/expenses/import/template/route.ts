import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const csv =
    "date,category,description,amount\n" +
    "2025-09-01,Food Cost,Pepperoni order,125.00\n" +
    "2025-09-02,Supplies,Boxes and napkins,42.50\n" +
    "2025-09-03,Labor,Staff overtime,210.00\n";
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="expenses-template.csv"',
    },
  });
}
