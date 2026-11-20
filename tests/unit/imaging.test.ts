import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { renderFiltered } from "@/lib/imaging/compose";
import { computeBands, keptSegments, mergeBands, planRemoval, rowStdDev } from "@/lib/imaging/rows";
import { decodeRgb, makeScreenshot, rowsOf } from "../support/synthetic";

// All images here are SYNTHETIC test images (see tests/support/synthetic.ts).

/** Imprecise boxes, like a vision model would return (off by a few px). */
function noisyBoxes(rows: { y: number; height: number }[], width: number, jitter = 3) {
  return rows.map((r, i) => ({
    id: `match_${String(i + 1).padStart(3, "0")}`,
    box: { x: 0, y: r.y + (i % 2 ? jitter : -jitter), width, height: r.height + (i % 2 ? -jitter : jitter) },
  }));
}

describe("row geometry", () => {
  it("merges overlapping bands and computes kept segments", () => {
    expect(mergeBands([{ top: 10, bottom: 20 }, { top: 15, bottom: 30 }, { top: 40, bottom: 50 }])).toEqual([
      { top: 10, bottom: 30 },
      { top: 40, bottom: 50 },
    ]);
    expect(keptSegments([{ top: 10, bottom: 20 }], 100)).toEqual([{ top: 0, bottom: 10 }, { top: 20, bottom: 100 }]);
  });

  it("detects uniform separator rows", () => {
    const w = 50, h = 4;
    const g = new Uint8Array(w * h);
    for (let x = 0; x < w; x++) g[w + x] = x % 2 ? 0 : 255; // row 1 textured
    const std = rowStdDev(g, w, h);
    expect(std[0]).toBe(0);
    expect(std[1]).toBeGreaterThan(50);
  });

  it("refuses to cut the entire image", () => {
    const std = new Float32Array(100);
    const items = [{ id: "a", box: { x: 0, y: 0, width: 10, height: 100 } }];
    const bands = computeBands(items, std, 100);
    const plan = planRemoval(items, new Set(["a"]), bands, std, 100);
    expect(plan.cuts).toEqual([]);
    expect(plan.warnings.join(" ")).toMatch(/entire image/);
  });
});

describe("renderFiltered (Sharp)", () => {
  it("removes one row and keeps everything else pixel-identical", async () => {
    const { synth, raw } = await makeScreenshot([
      { height: 60, color: [200, 30, 30] },
      { height: 60, color: [30, 200, 30] },
      { height: 60, color: [30, 30, 200] },
    ]);
    const fixtures = noisyBoxes(synth.rows, synth.width);
    const out = await renderFiltered({ image: synth.png, fixtures, removeIds: ["match_002"] });
    expect(out.removedIds).toEqual(["match_002"]);
    // Removed: 60px row + its 12px trailing gap
    expect(out.height).toBe(synth.height - 72);
    const res = await decodeRgb(out.png);
    expect(res.width).toBe(synth.width);
    // Header preserved exactly
    expect(Buffer.compare(rowsOf(res.data, synth.width, 0, synth.header.height), rowsOf(raw, synth.width, 0, synth.header.height))).toBe(0);
    // Row 1 preserved exactly at same position
    const r1 = synth.rows[0]!;
    expect(Buffer.compare(rowsOf(res.data, synth.width, r1.y, r1.height), rowsOf(raw, synth.width, r1.y, r1.height))).toBe(0);
    // Row 3 shifted up by 72 px but pixel-identical
    const r3 = synth.rows[2]!;
    expect(Buffer.compare(rowsOf(res.data, synth.width, r3.y - 72, r3.height), rowsOf(raw, synth.width, r3.y, r3.height))).toBe(0);
    // Footer preserved
    expect(Buffer.compare(rowsOf(res.data, synth.width, synth.footer.y - 72, synth.footer.height), rowsOf(raw, synth.width, synth.footer.y, synth.footer.height))).toBe(0);
  });

  it("removes multiple non-adjacent rows with different heights", async () => {
    const { synth, raw } = await makeScreenshot([
      { height: 40, color: [200, 30, 30] },
      { height: 90, color: [30, 200, 30] },
      { height: 55, color: [30, 30, 200] },
      { height: 70, color: [200, 200, 30] },
      { height: 48, color: [30, 200, 200] },
    ]);
    const fixtures = noisyBoxes(synth.rows, synth.width, 4);
    const out = await renderFiltered({ image: synth.png, fixtures, removeIds: ["match_001", "match_004"] });
    expect(out.removedIds.sort()).toEqual(["match_001", "match_004"]);
    expect(out.height).toBe(synth.height - (40 + 12) - (70 + 12));
    const res = await decodeRgb(out.png);
    // Kept row 2 (green) now directly after header gap
    const r2 = synth.rows[1]!;
    expect(Buffer.compare(rowsOf(res.data, synth.width, r2.y - 52, r2.height), rowsOf(raw, synth.width, r2.y, r2.height))).toBe(0);
    const r5 = synth.rows[4]!;
    expect(Buffer.compare(rowsOf(res.data, synth.width, r5.y - 52 - 82, r5.height), rowsOf(raw, synth.width, r5.y, r5.height))).toBe(0);
  });

  it("removing adjacent rows merges cuts cleanly", async () => {
    const { synth } = await makeScreenshot([
      { height: 50, color: [200, 30, 30] },
      { height: 50, color: [30, 200, 30] },
      { height: 50, color: [30, 30, 200] },
    ]);
    const out = await renderFiltered({ image: synth.png, fixtures: noisyBoxes(synth.rows, synth.width), removeIds: ["match_001", "match_002"] });
    expect(out.height).toBe(synth.height - 2 * 62);
  });

  it("returns the original pixels when nothing is removed", async () => {
    const { synth, raw } = await makeScreenshot([{ height: 50, color: [200, 30, 30] }]);
    const out = await renderFiltered({ image: synth.png, fixtures: noisyBoxes(synth.rows, synth.width), removeIds: [] });
    const res = await decodeRgb(out.png);
    expect(Buffer.compare(res.data, raw)).toBe(0);
  });

  it("masks instead of cutting when a removed fixture sits beside a kept one (grid layout)", async () => {
    const { synth } = await makeScreenshot([{ height: 80, color: [200, 30, 30] }]);
    const r = synth.rows[0]!;
    const fixtures = [
      { id: "match_001", box: { x: 0, y: r.y, width: 200, height: r.height } },
      { id: "match_002", box: { x: 200, y: r.y, width: 200, height: r.height } },
    ];
    const out = await renderFiltered({ image: synth.png, fixtures, removeIds: ["match_002"] });
    expect(out.maskedIds).toEqual(["match_002"]);
    expect(out.height).toBe(synth.height);
    expect(out.warnings.length).toBeGreaterThan(0);
  });

  it("accepts JPEG input and outputs lossless PNG of the same width", async () => {
    const { synth } = await makeScreenshot([{ height: 60, color: [200, 30, 30] }, { height: 60, color: [30, 30, 200] }]);
    const jpg = await sharp(synth.png).jpeg({ quality: 92 }).toBuffer();
    const out = await renderFiltered({ image: jpg, fixtures: noisyBoxes(synth.rows, synth.width), removeIds: ["match_001"] });
    const meta = await sharp(out.png).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(synth.width);
    expect(out.removedIds).toEqual(["match_001"]);
  });

  it("clamps out-of-range boxes instead of crashing", async () => {
    const { synth } = await makeScreenshot([{ height: 60, color: [200, 30, 30] }]);
    const out = await renderFiltered({
      image: synth.png,
      fixtures: [{ id: "match_001", box: { x: -50 as unknown as number, y: synth.rows[0]!.y, width: 99999, height: 60 } }],
      removeIds: ["match_001"],
    });
    expect(out.width).toBe(synth.width);
  });
});
