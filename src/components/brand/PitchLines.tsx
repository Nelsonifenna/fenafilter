import { cn } from "../ui/primitives";

/**
 * Half-pitch line drawing used as structural background geometry.
 * Proportions follow a real pitch (105 × 68 m, penalty area 40.3 × 16.5 m,
 * goal area 18.3 × 5.5 m, centre circle r = 9.15 m). Purely decorative.
 */
export function PitchLines({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 68 52.5" className={cn("pointer-events-none select-none", className)} aria-hidden fill="none" preserveAspectRatio="xMidYMid meet">
      <g className="stroke-line-strong" strokeWidth="0.18">
        <rect x="0.1" y="0.1" width="67.8" height="52.3" />
        {/* penalty area + goal area at the top */}
        <rect x="13.85" y="0.1" width="40.3" height="16.5" />
        <rect x="24.85" y="0.1" width="18.3" height="5.5" />
        <circle cx="34" cy="11" r="0.35" className="fill-line-strong" />
        <path d="M26.7 16.6a9.15 9.15 0 0 0 14.6 0" />
        {/* halfway line + centre circle at the bottom */}
        <circle cx="34" cy="52.4" r="9.15" />
        <circle cx="34" cy="52.4" r="0.35" className="fill-line-strong" />
      </g>
    </svg>
  );
}
