import Link from "next/link";

/**
 * FenaFilter mark: a penalty box seen from above, with the "filter" line
 * crossing it — pitch geometry rather than a generic funnel icon.
 */
export function LogoMark({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none">
      <rect x="1" y="1" width="22" height="22" className="fill-accent" />
      <path d="M6 1v8h12V1M9.5 1v3.5h5V1" className="stroke-accent-ink" strokeWidth="1.6" />
      <path d="M4 15.5h16" className="stroke-accent-ink" strokeWidth="1.6" />
      <path d="M8 19.5h8" className="stroke-accent-ink" strokeWidth="1.6" />
    </svg>
  );
}

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="group flex items-center gap-2.5" aria-label="FenaFilter home">
      <LogoMark />
      <span className="font-display text-[1.35rem] font-bold uppercase leading-none tracking-[0.02em]">
        Fena<span className="text-muted transition-colors group-hover:text-fg">Filter</span>
      </span>
    </Link>
  );
}
