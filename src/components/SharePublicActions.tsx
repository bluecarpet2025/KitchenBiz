"use client";

export default function SharePublicActions() {
  return (
    <div className="mt-3 flex justify-center gap-3 print:hidden">
      <button
        onClick={() => window.print()}
        className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
      >
        Print
      </button>
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(location.href);
          } catch {
            // noop
          }
        }}
        className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
      >
        Copy link
      </button>
    </div>
  );
}
