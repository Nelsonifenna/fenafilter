import sharp from "sharp";
import type { Box } from "../domain/schemas";
import { computeBands, keptSegments, planRemoval, rowStdDev, type RowItem } from "./rows";

/**
 * Image editing with Sharp — operates directly on the original pixels.
 * No generative model ever redraws the screenshot.
 *
 * Steps: decode (auto-orient) → measure row uniformity → snap fixture bands →
 * plan cuts → copy kept pixel rows into a new buffer → encode as lossless PNG.
 * Metadata (EXIF etc.) is not copied to the output.
 */

export interface RenderInput {
  image: Buffer;
  fixtures: RowItem[];
  removeIds: string[];
}

export interface RenderOutput {
  png: Buffer;
  width: number;
  height: number;
  removedIds: string[];
  maskedIds: string[];
  warnings: string[];
}

export const MAX_PIXELS = 60_000_000;

export async function decodeOriented(image: Buffer) {
  const base = sharp(image, { limitInputPixels: MAX_PIXELS }).rotate();
  const { data, info } = await base.clone().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { rgba: data, width: info.width, height: info.height };
}

function grayFromRgba(rgba: Buffer, width: number, height: number): Uint8Array {
  const g = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < g.length; i++, p += 4) {
    g[i] = (rgba[p]! * 299 + rgba[p + 1]! * 587 + rgba[p + 2]! * 114) / 1000;
  }
  return g;
}

/** Median colour of the pixels just outside a box — used to mask side-by-side fixtures. */
function backgroundAround(rgba: Buffer, width: number, height: number, box: Box): [number, number, number, number] {
  const samples: number[][] = [];
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const p = (y * width + x) * 4;
    samples.push([rgba[p]!, rgba[p + 1]!, rgba[p + 2]!, rgba[p + 3]!]);
  };
  for (let x = box.x; x < box.x + box.width; x += 3) {
    push(x, box.y - 2);
    push(x, box.y + box.height + 1);
  }
  for (let y = box.y; y < box.y + box.height; y += 3) {
    push(box.x - 2, y);
    push(box.x + box.width + 1, y);
  }
  if (samples.length === 0) return [255, 255, 255, 255];
  const med = (i: number) => samples.map((s) => s[i]!).sort((a, b) => a - b)[Math.floor(samples.length / 2)]!;
  return [med(0), med(1), med(2), med(3)];
}

export async function renderFiltered({ image, fixtures, removeIds }: RenderInput): Promise<RenderOutput> {
  const meta = await sharp(image, { limitInputPixels: MAX_PIXELS }).metadata();
  const { rgba, width, height } = await decodeOriented(image);
  const std = rowStdDev(grayFromRgba(rgba, width, height), width, height);

  // Clamp boxes defensively — never trust coordinates blindly.
  const items: RowItem[] = fixtures
    .map((f) => {
      const x = Math.max(0, Math.min(f.box.x, width - 1));
      const y = Math.max(0, Math.min(f.box.y, height - 1));
      return { id: f.id, box: { x, y, width: Math.max(1, Math.min(f.box.width, width - x)), height: Math.max(1, Math.min(f.box.height, height - y)) } };
    })
    .filter((f) => f.box.height >= 4);

  const bands = computeBands(items, std, height);
  const plan = planRemoval(items, new Set(removeIds), bands, std, height);

  // Mask side-by-side fixtures that cannot be cut.
  for (const id of plan.maskIds) {
    const it = items.find((i) => i.id === id);
    if (!it) continue;
    const [r, g, b, a] = backgroundAround(rgba, width, height, it.box);
    for (let y = it.box.y; y < it.box.y + it.box.height; y++) {
      for (let x = it.box.x; x < it.box.x + it.box.width; x++) {
        const p = (y * width + x) * 4;
        rgba[p] = r;
        rgba[p + 1] = g;
        rgba[p + 2] = b;
        rgba[p + 3] = a;
      }
    }
  }

  const segments = keptSegments(plan.cuts, height);
  const newHeight = segments.reduce((s, b) => s + (b.bottom - b.top), 0);
  const rowBytes = width * 4;
  const out = Buffer.allocUnsafe(newHeight * rowBytes);
  let offset = 0;
  for (const seg of segments) {
    const len = (seg.bottom - seg.top) * rowBytes;
    rgba.copy(out, offset, seg.top * rowBytes, seg.top * rowBytes + len);
    offset += len;
  }

  let pipeline = sharp(out, { raw: { width, height: newHeight, channels: 4 } });
  if (!meta.hasAlpha) pipeline = pipeline.removeAlpha();
  const png = await pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();

  return { png, width, height: newHeight, removedIds: plan.removedIds, maskedIds: plan.maskIds, warnings: plan.warnings };
}
