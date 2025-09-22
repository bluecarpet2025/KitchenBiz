import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const headers = [
    "first_name",
    "last_name",
    "email",
    "phone",
    "role",
    "pay_type",
    "pay_rate_usd",
    "hire_date",
    "end_date",
    "is_active",
    "notes",
  ].join(",");

  const sample = [
    "Alex,Lopez,alex@example.com,555-111-2222,Cook,hourly,18.50,2025-08-01,,true,Full-time nights",
    "Sam,Ng,sam@example.com,555-333-4444,Server,hourly,7.25,2025-09-05,,true,",
  ].join("\n");

  const csv = headers + "\n" + sample + "\n";

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="staff-template.csv"',
    },
  });
}
