import Link from "next/link";

/** FenaFilter mark: a funnel formed from pitch lines. */
export function LogoMark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect x="1" y="1" width="30" height="30" rx="8" className="fill-accent/15 stroke-accent/50" strokeWidth="1.5" />
      <path d="M8 9h16l-6 7.5V23l-4 2v-8.5L8 9Z" className="fill-accent" />
      <circle cx="16" cy="9" r="2.2" className="fill-ink stroke-accent" strokeWidth="1.2" />
    </svg>
  );
}

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 font-semibold tracking-tight text-fg" aria-label="FenaFilter home">
      <LogoMark />
      <span>
        Fena<span className="text-accent">Filter</span>
      </span>
    </Link>
  );
}
