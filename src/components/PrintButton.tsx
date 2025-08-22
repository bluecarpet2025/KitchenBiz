'use client';

type Props = { className?: string };

export default function PrintButton({ className }: Props) {
  return (
    <button
      onClick={() => window.print()}
      className={className ?? 'px-3 py-2 border rounded-md text-sm hover:bg-neutral-900 print:hidden'}
    >
      Print
    </button>
  );
}
