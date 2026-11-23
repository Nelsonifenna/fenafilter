"use client";

import type { Box } from "@/lib/domain/schemas";
import { cn } from "../ui/primitives";

export interface OverlayItem {
  id: string;
  box: Box;
  label: string;
  tone: "neutral" | "keep" | "remove" | "review" | "warn" | "excluded";
}

const TONE: Record<OverlayItem["tone"], string> = {
  neutral: "border-fg/55 hover:border-fg",
  keep: "border-accent",
  // Removed rows are hatched, like a struck-out line on a team sheet.
  remove: "border-danger bg-[repeating-linear-gradient(135deg,color-mix(in_oklab,var(--color-danger)_30%,transparent)_0_2px,transparent_2px_8px)]",
  review: "border-warn border-dashed",
  warn: "border-warn",
  excluded: "border-faint border-dashed",
};
const TAG: Record<OverlayItem["tone"], string> = {
  neutral: "bg-fg text-ink",
  keep: "bg-accent text-accent-ink",
  remove: "bg-danger text-ink",
  review: "bg-warn text-ink",
  warn: "bg-warn text-ink",
  excluded: "bg-surface-3 text-muted",
};

/**
 * The original screenshot with fixture boxes on top. Boxes are positioned in
 * percentages of the original pixel size, so they scale with the image.
 */
export function ImageWithBoxes({
  src,
  width,
  height,
  items,
  selectedId,
  onSelect,
  showBoxes = true,
}: {
  src: string;
  width: number;
  height: number;
  items: OverlayItem[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  showBoxes?: boolean;
}) {
  return (
    <div className="relative mx-auto w-full" style={{ maxWidth: Math.min(width, 720) }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- private, session-authenticated image route */}
      <img src={src} alt="Original screenshot" width={width} height={height} className="block h-auto w-full" />
      {showBoxes &&
        items.map((it) => {
          const selected = selectedId === it.id;
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => onSelect?.(it.id)}
              aria-label={`Select ${it.label}`}
              aria-pressed={selected}
              className={cn(
                "absolute border-[1.5px] transition-[border-color,box-shadow] duration-150",
                TONE[it.tone],
                selected && "z-10 shadow-[0_0_0_2px_var(--color-ink),0_0_0_3.5px_var(--color-accent)]",
              )}
              style={{
                left: `${(it.box.x / width) * 100}%`,
                top: `${(it.box.y / height) * 100}%`,
                width: `${(it.box.width / width) * 100}%`,
                height: `${(it.box.height / height) * 100}%`,
              }}
            >
              <span className={cn("absolute top-0 left-0 px-1 font-mono text-[10px] leading-4 tnum", TAG[it.tone])}>{it.id.slice(-2)}</span>
            </button>
          );
        })}
    </div>
  );
}
