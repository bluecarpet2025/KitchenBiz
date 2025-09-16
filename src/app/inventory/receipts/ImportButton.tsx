'use client';
import { useState } from 'react';
import ImportDialog from '@/components/ImportDialog';

export default function ImportButton({ tenantId }: { tenantId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
              onClick={() => setOpen(true)}>
        Import CSV
      </button>
      {open && (
        <ImportDialog
          type="receipts"
          tenantId={tenantId}
          onClose={() => setOpen(false)}
          onCommitted={() => location.reload()}
        />
      )}
    </>
  );
}
