'use client';

export default function PrintCopyActions() {
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      alert('Link copied to clipboard.');
    } catch {
      alert('Couldn’t copy link.');
    }
  }

  return (
    <div className="flex gap-2 print:hidden">
      <button
        onClick={() => window.print()}
        className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
      >
        Print
      </button>
      <button
        onClick={copyLink}
        className="px-3 py-2 border rounded-md text-sm hover:bg-neutral-900"
      >
        Copy link
      </button>
    </div>
  );
}
