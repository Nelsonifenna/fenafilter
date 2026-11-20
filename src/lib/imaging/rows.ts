import type { Box } from "../domain/schemas";

/**
 * Pure geometry for row removal (no image library), so it is easy to test.
 *
 * Idea: AI bounding boxes are approximate. Real screenshots separate rows with
 * uniform background or divider lines — pixel rows whose brightness barely
 * varies across the width. We snap each fixture's edges to the nearest such
 * row so cuts land on clean boundaries and never slice through text or logos.
 */

export const UNIFORM_STD = 5;

export interface Band {
  /** inclusive */
  top: number;
  /** exclusive */
  bottom: number;
}

/** Standard deviation of each pixel row of a single-channel image (ignoring 2% side margins). */
export function rowStdDev(gray: Uint8Array, width: number, height: number): Float32Array {
  const out = new Float32Array(height);
  const x0 = Math.floor(width * 0.02);
  const x1 = Math.max(x0 + 1, Math.ceil(width * 0.98));
  const n = x1 - x0;
  for (let y = 0; y < height; y++) {
    let sum = 0, sq = 0;
    const off = y * width;
    for (let x = x0; x < x1; x++) {
      const v = gray[off + x]!;
      sum += v;
      sq += v * v;
    }
    const mean = sum / n;
    out[y] = Math.sqrt(Math.max(0, sq / n - mean * mean));
  }
  return out;
}

const isUniform = (std: Float32Array, y: number) => y >= 0 && y < std.length && std[y]! < UNIFORM_STD;

/**
 * Snap the TOP edge to the first content row of the fixture.
 * 1. Look outward (upwards) for the gap above the row; if none, look slightly inward.
 * 2. From that gap, step down to the first non-uniform (content) row.
 */
function snapTop(std: Float32Array, y: number, tolOut: number, tolIn: number, limit: number): number {
  let gap: number | null = null;
  for (let d = 0; d <= tolOut && y - d >= 0; d++) if (isUniform(std, y - d)) { gap = y - d; break; }
  if (gap === null) for (let d = 1; d <= tolIn && y + d < limit; d++) if (isUniform(std, y + d)) { gap = y + d; break; }
  if (gap === null) return y;
  let top = gap;
  while (top < limit && isUniform(std, top)) top++;
  return top >= limit ? y : top; // no content inside the box: keep the original edge
}

/**
 * Snap the BOTTOM edge (exclusive) to just after the last content row.
 * 1. Look outward (downwards) for the gap below the row; if none, look slightly inward.
 * 2. From that gap, step up while the row above is still uniform.
 */
function snapBottom(std: Float32Array, yb: number, tolOut: number, tolIn: number, floor: number, height: number): number {
  let gap: number | null = null;
  for (let d = 0; d <= tolOut && yb + d < height; d++) if (isUniform(std, yb + d)) { gap = yb + d; break; }
  if (gap === null) for (let d = 1; d <= tolIn && yb - d > floor; d++) if (isUniform(std, yb - d)) { gap = yb - d; break; }
  if (gap === null) return Math.min(yb, height);
  let bottom = gap;
  while (bottom - 1 > floor && isUniform(std, bottom - 1)) bottom--;
  return bottom - 1 <= floor ? Math.min(yb, height) : bottom;
}

export interface RowItem {
  id: string;
  box: Box;
}

/** Compute a clean vertical band for every fixture, non-overlapping and in top-to-bottom order. */
export function computeBands(items: RowItem[], std: Float32Array, height: number): Map<string, Band> {
  const sorted = [...items].sort((a, b) => a.box.y - b.box.y);
  const bands = new Map<string, Band>();
  let prevBottom = 0;
  for (const it of sorted) {
    const { y, height: h } = it.box;
    const tolOut = Math.min(60, Math.max(6, Math.round(h * 0.35)));
    const tolIn = Math.max(2, Math.round(h * 0.15));
    const yb = y + h;
    const top0 = snapTop(std, y, tolOut, tolIn, yb);
    const bot0 = snapBottom(std, yb, tolOut, tolIn, top0, height);
    const top = Math.max(0, Math.min(top0, height - 1));
    let bottom = Math.max(top + 1, Math.min(bot0, height));
    // Rows in a vertical list must not overlap; side-by-side items may.
    const sideBySide = sorted.some((o) => o !== it && Math.min(o.box.y + o.box.height, yb) - Math.max(o.box.y, y) > h * 0.5 && (o.box.x + o.box.width <= it.box.x || it.box.x + it.box.width <= o.box.x));
    const finalTop = sideBySide ? top : Math.max(top, Math.min(prevBottom, y));
    if (bottom <= finalTop) bottom = Math.min(height, finalTop + h);
    bands.set(it.id, { top: finalTop, bottom });
    if (!sideBySide) prevBottom = Math.max(prevBottom, bottom);
  }
  return bands;
}

export interface RemovalPlan {
  cuts: Band[];
  maskIds: string[];
  removedIds: string[];
  warnings: string[];
}

/**
 * Decide which pixel rows to cut.
 * - A removed fixture whose band overlaps a KEPT fixture vertically (grid / side-by-side
 *   layouts) cannot be cut out without damaging the kept one; it is masked instead.
 * - After a removed row, purely uniform padding up to the next fixture is also cut,
 *   so the remaining rows keep their original spacing.
 */
export function planRemoval(items: RowItem[], removeIds: Set<string>, bands: Map<string, Band>, std: Float32Array, height: number): RemovalPlan {
  const warnings: string[] = [];
  const kept = items.filter((i) => !removeIds.has(i.id));
  const removed = items.filter((i) => removeIds.has(i.id));
  const cuts: Band[] = [];
  const maskIds: string[] = [];
  const removedIds: string[] = [];
  const allTops = [...bands.values()].map((b) => b.top).sort((a, b) => a - b);

  for (const r of removed) {
    const band = bands.get(r.id);
    if (!band) continue;
    const conflict = kept.some((k) => {
      const kb = k.box;
      return Math.min(kb.y + kb.height, band.bottom) - Math.max(kb.y, band.top) > 2;
    });
    if (conflict) {
      maskIds.push(r.id);
      continue;
    }
    // Remove the plain spacing that follows the row too (the spacing above it stays),
    // so the remaining rows keep their original rhythm.
    const nextTop = allTops.find((t) => t >= band.bottom) ?? height;
    let bottom = band.bottom;
    while (bottom < nextTop && isUniform(std, bottom)) bottom++;
    cuts.push({ top: band.top, bottom });
    removedIds.push(r.id);
  }
  if (maskIds.length) {
    warnings.push(`${maskIds.length} fixture(s) sit beside other fixtures that are kept, so they were covered with the background colour instead of being cut out.`);
  }
  const merged = mergeBands(cuts);
  const total = merged.reduce((s, b) => s + (b.bottom - b.top), 0);
  if (total >= height) {
    return { cuts: [], maskIds, removedIds: [], warnings: [...warnings, "Removing these fixtures would remove the entire image; nothing was cut."] };
  }
  return { cuts: merged, maskIds, removedIds, warnings };
}

export function mergeBands(bands: Band[]): Band[] {
  const sorted = [...bands].sort((a, b) => a.top - b.top);
  const out: Band[] = [];
  for (const b of sorted) {
    const last = out[out.length - 1];
    if (last && b.top <= last.bottom) last.bottom = Math.max(last.bottom, b.bottom);
    else out.push({ ...b });
  }
  return out;
}

/** Rows that remain after cutting, as [top, bottom) segments. */
export function keptSegments(cuts: Band[], height: number): Band[] {
  const out: Band[] = [];
  let y = 0;
  for (const c of mergeBands(cuts)) {
    if (c.top > y) out.push({ top: y, bottom: c.top });
    y = Math.max(y, c.bottom);
  }
  if (y < height) out.push({ top: y, bottom: height });
  return out;
}
