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
  neutral: "border-info/80 bg-info/5",
  keep: "border-accent/90 bg-accent/5",
  remove: "border-danger bg-danger/15",
  review: "border-warn bg-warn/10",
  warn: "border-warn bg-warn/10",
  excluded: "border-faint/70 border-dashed bg-transparent",
};

/**
 * The original screenshot with fixture boxes drawn on top. Boxes are positioned
 * in percentages of the original pixel size, so they scale with the image.
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
      <img src={src} alt="Original screenshot" width={width} height={height} className="block h-auto w-full rounded-lg" />
      {showBoxes &&
        items.map((it) => (
          <button
            key={it.id}
            type="button"
            onClick={() => onSelect?.(it.id)}
            aria-label={`Select ${it.label}`}
            className={cn("absolute rounded-[3px] border-2 transition-shadow", TONE[it.tone], selectedId === it.id && "ring-2 ring-fg ring-offset-1 ring-offset-ink")}
            style={{
              left: `${(it.box.x / width) * 100}%`,
              top: `${(it.box.y / height) * 100}%`,
              width: `${(it.box.width / width) * 100}%`,
              height: `${(it.box.height / height) * 100}%`,
            }}
          >
            <span className="absolute -top-px left-0 -translate-y-full rounded-t bg-ink/85 px-1 font-mono text-[10px] leading-4 text-fg">{it.id.replace("match_", "#")}</span>
          </button>
        ))}
    </div>
  );
}
