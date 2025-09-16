import Papa from 'papaparse';
import { normalizeHeader } from './registry';
import { ImportMapping, ParsedRow } from './types';

export function parseCsv(text: string) {
  const res = Papa.parse<string[]>(text.trim(), {
    header: false,
    skipEmptyLines: true,
  });
  if (res.errors?.length) throw new Error(res.errors[0].message);
  const rows = (res.data as string[][]).filter(r => r.length);
  const headers = rows.shift() ?? [];
  return { headers, rows };
}

export function autoMap(headers: string[], requiredKeys: {key:string; synonyms?:string[]}[]) {
  const map: ImportMapping = {};
  const norm = headers.map(h => normalizeHeader(h));

  requiredKeys.forEach(col => {
    const candidates = [col.key, ...(col.synonyms ?? [])].map(normalizeHeader);
    let idx = -1;
    for (let i=0;i<norm.length;i++) {
      if (candidates.includes(norm[i])) { idx = i; break; }
    }
    if (idx >= 0) map[headers[idx]] = col.key;
  });

  return map; // partial is okay; UI will ask for missing columns
}

export function materializeRows(headers: string[], rows: string[][], mapping: ImportMapping): ParsedRow[] {
  const keyForHeader = (h: string) => mapping[h] ?? null;
  return rows.map(r => {
    const obj: ParsedRow = {};
    headers.forEach((h, i) => {
      const key = keyForHeader(h);
      if (key) obj[key] = r[i] ?? '';
    });
    return obj;
  });
}
