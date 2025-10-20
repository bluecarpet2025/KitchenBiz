import Link from "next/link";

type TopNavButtonProps = {
  href: string;
  label: string;
  variant?: "default" | "danger";
};

export default function TopNavButton({ href, label, variant = "default" }: TopNavButtonProps) {
  const base =
    "rounded border px-3 py-1 text-sm transition-colors " +
    "hover:bg-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-700";

  const variants = {
    default: "border-neutral-500 hover:border-neutral-400",
    danger: "border-red-500 text-red-300 hover:border-red-400 hover:text-red-200",
  };

  return (
    <Link href={href} className={`${base} ${variants[variant]}`}>
      {label}
    </Link>
  );
}
