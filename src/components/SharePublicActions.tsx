"use client";

export default function SharePublicActions({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div className={className}>
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
            // ignore
          }
        }}
        className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
      >
        Copy link
      </button>
    </div>
  );
}
