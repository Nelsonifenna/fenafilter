import { Loader2 } from "lucide-react";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

/* ------------------------------ Button ------------------------------ */
/* Square, flat, with a 1px press-down. Lime is reserved for the main action. */

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink font-semibold hover:bg-accent-strong disabled:bg-surface-3 disabled:text-faint disabled:opacity-100",
  secondary: "border border-line-strong text-fg hover:border-fg hover:bg-surface-2",
  ghost: "text-muted hover:text-fg hover:bg-surface-2",
  danger: "border border-danger/50 text-danger hover:bg-danger-soft hover:border-danger",
};
const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-[15px] gap-2.5",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cn(
    "inline-flex select-none items-center justify-center whitespace-nowrap rounded-[2px] transition-[background-color,border-color,color,transform] duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-40",
    VARIANTS[variant],
    SIZES[size],
    extra,
  );
}

export function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...props }: ComponentProps<"button"> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button className={buttonClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function ButtonLink({ variant = "primary", size = "md", className, ...props }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

/* ---------------------------- Structure ----------------------------- */

/** Flat surface. Use only where a boundary does real work (image stage, editor). */
export function Panel({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("border border-line bg-surface", className)} {...props} />;
}

export function Kicker({ index, children, className }: { index?: string; children: ReactNode; className?: string }) {
  return (
    <p className={cn("kicker flex items-baseline gap-3", className)}>
      {index && <span className="text-accent">{index}</span>}
      <span>{children}</span>
    </p>
  );
}

/** Section heading: hairline rule, numbered kicker, title, optional description and action. */
export function SectionHead({ index, label, title, description, action, className }: { index?: string; label?: string; title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <header className={cn("border-t border-line pt-4", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {(index || label) && <Kicker index={index}>{label ?? ""}</Kicker>}
          <h2 className={cn("font-display text-section font-semibold tracking-tight", (index || label) && "mt-2")}>{title}</h2>
          {description && <p className="mt-2 max-w-prose text-sm text-muted">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </header>
  );
}

/* ----------------------------- Labels ------------------------------- */

type Tone = "neutral" | "accent" | "danger" | "warn";
const TONE_TEXT: Record<Tone, string> = { neutral: "text-muted", accent: "text-accent", danger: "text-danger", warn: "text-warn" };
const TONE_BG: Record<Tone, string> = { neutral: "bg-faint", accent: "bg-accent", danger: "bg-danger", warn: "bg-warn" };
const TONE_RULE: Record<Tone, string> = { neutral: "border-line-strong", accent: "border-accent", danger: "border-danger", warn: "border-warn" };

/** Small mono tag. Use sparingly — prefer plain text where possible. */
export function Tag({ tone = "neutral", className, ...props }: ComponentProps<"span"> & { tone?: Tone }) {
  return <span className={cn("inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em]", TONE_TEXT[tone], className)} {...props} />;
}

/** Status dot + text. */
export function Dot({ tone = "neutral", pulse, children, className }: { tone?: Tone; pulse?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-[13px]", className)}>
      <span className={cn("size-1.5 shrink-0", TONE_BG[tone], pulse && "animate-tick")} aria-hidden />
      <span className={TONE_TEXT[tone] === "text-muted" ? "text-muted" : "text-fg"}>{children}</span>
    </span>
  );
}

/** Notice with a coloured left rule. Replaces boxed alert cards. */
export function Notice({ tone = "neutral", title, children, className }: { tone?: Tone; title?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("animate-rise border-l-2 bg-surface py-3 pr-4 pl-4 text-sm", TONE_RULE[tone], className)}>
      {title && <p className={cn("font-semibold", tone === "neutral" ? "text-fg" : TONE_TEXT[tone])}>{title}</p>}
      {children && <div className={cn("text-fg/85", title ? "mt-1" : undefined)}>{children}</div>}
    </div>
  );
}

/** Confidence meter: mono number + 2px bar. */
export function Meter({ value, label = "confidence" }: { value: number; label?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const tone = pct >= 90 ? "bg-accent" : pct >= 75 ? "bg-fg/70" : "bg-warn";
  return (
    <span className="inline-flex items-center gap-2" title={`${pct}% ${label}`}>
      <span className="relative h-[2px] w-10 bg-line-strong" aria-hidden>
        <span className={cn("absolute inset-y-0 left-0", tone)} style={{ width: `${pct}%` }} />
      </span>
      <span className="tnum font-mono text-[12px] text-muted">
        {pct}
        <span className="sr-only">% {label}</span>
      </span>
    </span>
  );
}

/* ----------------------------- Loading ------------------------------ */

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-4 animate-spin text-accent", className)} aria-label="Loading" />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse bg-surface-2", className)} />;
}

/* ------------------------------ Inputs ------------------------------ */

export const inputClass =
  "w-full rounded-[2px] border border-line bg-ink px-3 py-2 text-sm text-fg placeholder:text-faint transition-colors hover:border-line-strong focus:border-accent focus:outline-none disabled:opacity-50";
