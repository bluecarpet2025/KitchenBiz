export const runtime = "edge";

export async function GET() {
  // CSV columns: item,qty,unit,cost_total — matches Purchase importer
  const csv =
    "item,qty,unit,cost_total\n" +
    "Mozzarella,90000,g,672.00\n" +
    "Flour (00),900000,g,636.00\n" +
    "Tomato sauce,18000,ml,96.00\n";

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="kitchenbiz-purchase-template.csv"',
      "Cache-Control": "no-store",
    },
  });
}
