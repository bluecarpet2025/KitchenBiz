'use client';
export default function Tip({ text }: { text: string }) {
  return (
    <span
      title={text}
      className="ml-1 inline-flex items-center justify-center w-4 h-4 text-[10px] rounded-full border border-neutral-600 text-neutral-300 cursor-help"
    >
      ?
    </span>
  );
}
