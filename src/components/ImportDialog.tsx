'use client';
import { useMemo, useState } from 'react';
import { templates } from '@/lib/imports/registry';
import { parseCsv, autoMap, materializeRows } from '@/lib/imports/csv';
import { ImportMapping } from '@/lib/imports/types';

export default function ImportDialog({
  type,
  tenantId,
  onClose,
  onCommitted,
}: {
  type: 'receipts' | 'sales' | 'expenses';
  tenantId: string;
  onClose: () => void;
  onCommitted?: () => void;
}) {
  const tpl = templates[type];
  const [step, setStep] = useState<'pick'|'map'|'preview'|'commit'>('pick');
  const [fileName, setFileName] = useState<string>('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ImportMapping>({});
  const [preview, setPreview] = useState<any[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  function rememberKey() { return `kb_mapping_${type}_${tenantId}`; }

  function handleFile(file: File) {
    setFileName(file.name);
    file.text().then(text => {
      const { headers, rows } = parseCsv(text);
      setHeaders(headers);
      setRows(rows);
      // hydrate mapping (auto + localStorage)
      const saved = localStorage.getItem(rememberKey());
      if (saved) {
        setMapping(JSON.parse(saved));
      } else {
        setMapping(autoMap(headers, tpl.columns));
      }
      setStep('map');
    }).catch(e => setErrors([String(e?.message ?? e)]));
  }

  const missingRequired = useMemo(() => {
    const m = new Set(Object.values(mapping));
    return tpl.columns.filter(c => c.required && !m.has(c.key));
  }, [mapping, tpl.columns]);

  function toPreview() {
    const mats = materializeRows(headers, rows, mapping);
    setPreview(mats.slice(0, 50));
    setStep('preview');
  }

  async function commit() {
    try {
      setBusy(true);
      localStorage.setItem(rememberKey(), JSON.stringify(mapping));
      const payload = {
        type,
        tenantId,
        fileName,
        mapping,
        headers,
        rows,
      };
      const res = await fetch('/api/import/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      onCommitted?.();
      onClose();
    } catch (e:any) {
      setErrors([e?.message ?? 'Failed to import']);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="w-[min(900px,95vw)] bg-neutral-950 border rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-semibold">Import CSV — {tpl.description}</div>
          <button className="text-sm underline" onClick={onClose}>Close</button>
        </div>

        {errors.length > 0 && (
          <div className="mb-3 text-red-300 text-sm">{errors.join('\n')}</div>
        )}

        {step === 'pick' && (
          <div>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <div className="mt-3">
              <a
                href={`/api/import/template?type=${tpl.type}`}
                className="underline text-sm"
              >
                Download template
              </a>
            </div>
          </div>
        )}

        {step === 'map' && (
          <div className="space-y-3">
            <div className="text-sm opacity-80">File: {fileName}</div>
            <div className="border rounded">
              <table className="w-full text-sm">
                <thead className="bg-neutral-900/50">
                  <tr>
                    <th className="p-2 text-left">CSV header</th>
                    <th className="p-2 text-left">Map to</th>
                  </tr>
                </thead>
                <tbody>
                  {headers.map(h => (
                    <tr key={h} className="border-t">
                      <td className="p-2">{h}</td>
                      <td className="p-2">
                        <select
                          className="border rounded px-2 py-1 bg-neutral-950"
                          value={mapping[h] ?? ''}
                          onChange={e => setMapping(m => ({ ...m, [h]: e.target.value }))}
                        >
                          <option value="">(ignore)</option>
                          {tpl.columns.map(c => (
                            <option key={c.key} value={c.key}>
                              {c.label}{c.required ? ' *' : ''}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {missingRequired.length > 0 && (
              <div className="text-amber-300 text-sm">
                Missing required: {missingRequired.map(m => m.label).join(', ')}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button className="px-3 py-2 border rounded" onClick={() => setStep('pick')}>Back</button>
              <button
                className="px-3 py-2 border rounded disabled:opacity-50"
                disabled={missingRequired.length > 0}
                onClick={toPreview}
              >
                Preview
              </button>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-3">
            <div className="text-sm opacity-80">Showing first {preview.length} rows</div>
            <div className="border rounded overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-neutral-900/50">
                  <tr>
                    {Array.from(new Set(Object.values(mapping))).filter(Boolean).map(k => (
                      <th key={String(k)} className="p-2 text-left">{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r, i) => (
                    <tr key={i} className="border-t">
                      {Array.from(new Set(Object.values(mapping))).filter(Boolean).map(k => (
                        <td key={String(k)} className="p-2">{String(r[k] ?? '')}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2">
              <button className="px-3 py-2 border rounded" onClick={() => setStep('map')}>Back</button>
              <button className="px-3 py-2 bg-white text-black rounded disabled:opacity-50"
                disabled={busy} onClick={commit}>
                {busy ? 'Importing…' : 'Import'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
