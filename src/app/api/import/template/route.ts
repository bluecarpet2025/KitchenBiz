import { NextResponse } from 'next/server';
import { templates } from '@/lib/imports/registry';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') ?? 'receipts';
  const tpl = templates[type];
  if (!tpl) return new NextResponse('Unknown type', { status: 400 });

  const header = tpl.columns.map(c => c.key).join(',');
  const example = tpl.columns.map(c => c.example ?? '').join(',');

  const csv = [header, example].join('\n');
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${type}_template_v${tpl.version}.csv"`,
    },
  });
}
