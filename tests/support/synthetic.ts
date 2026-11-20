/**
 * MOCK DATA FOR ISOLATED TESTS ONLY.
 * Builds synthetic "screenshots" (header, fixture rows, footer separated by
 * plain background) so the image engine can be tested pixel-exactly without
 * real betting screenshots.
 */
import sharp from "sharp";

export interface SynthRow {
  height: number;
  color: [number, number, number];
}

export interface Synth {
  png: Buffer;
  width: number;
  height: number;
  /** Exact pixel rows of each row's content (y, height) */
  rows: { y: number; height: number; color: [number, number, number] }[];
  header: { y: number; height: number };
  footer: { y: number; height: number };
  /** Row y-ranges whose pixels must survive untouched */
}

const BG: [number, number, number] = [245, 245, 245];

export async function makeScreenshot(rowSpecs: SynthRow[], opts: { width?: number; gap?: number; headerH?: number; footerH?: number } = {}): Promise<{ synth: Synth; raw: Buffer }> {
  const width = opts.width ?? 400;
  const gap = opts.gap ?? 12;
  const headerH = opts.headerH ?? 50;
  const footerH = opts.footerH ?? 40;
  const height = headerH + gap + rowSpecs.reduce((s, r) => s + r.height + gap, 0) + footerH;
  const raw = Buffer.alloc(width * height * 3);
  const fill = (y0: number, h: number, rgb: [number, number, number], textured: boolean) => {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = 0; x < width; x++) {
        const p = (y * width + x) * 3;
        // Texture simulates text/logos (non-uniform rows).
        const t = textured && ((x >> 3) + (y >> 2)) % 3 === 0 ? 60 : 0;
        raw[p] = Math.max(0, rgb[0] - t);
        raw[p + 1] = Math.max(0, rgb[1] - t);
        raw[p + 2] = Math.max(0, rgb[2] - t);
      }
    }
  };
  fill(0, height, BG, false);
  fill(0, headerH, [20, 40, 90], true);
  let y = headerH + gap;
  const rows: Synth["rows"] = [];
  for (const r of rowSpecs) {
    fill(y, r.height, r.color, true);
    rows.push({ y, height: r.height, color: r.color });
    y += r.height + gap;
  }
  fill(y, footerH, [30, 30, 30], true);
  const png = await sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
  return { synth: { png, width, height, rows, header: { y: 0, height: headerH }, footer: { y, height: footerH } }, raw };
}

export async function decodeRgb(png: Buffer) {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** Extract a horizontal slice of rows from a raw RGB buffer. */
export function rowsOf(raw: Buffer, width: number, y: number, h: number) {
  return raw.subarray(y * width * 3, (y + h) * width * 3);
}
