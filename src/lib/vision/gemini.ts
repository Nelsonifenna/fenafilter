import "server-only";
import sharp from "sharp";
import type { Extraction } from "../domain/schemas";
import { AppError } from "../errors";

const UNREADABLE = "This screenshot could not be read. Please try again, or use a clearer image.";
import { extractJsonObject } from "../ai/json";
import { generateResilient } from "../ai/gemini";
import {
  dedupeFixtures,
  finalizeFixtures,
  type PlacedFixture,
  planTiles,
  RawVisionSchema,
  toPixelBox,
  VISION_RESPONSE_SCHEMA,
  VISION_SYSTEM_PROMPT,
  VISION_USER_PROMPT,
} from "./extraction";

/**
 * Gemini vision agent (uses the shared client in src/lib/ai/gemini.ts).
 *
 * Uses `models.generateContent` with `responseMimeType: "application/json"`
 * + `responseJsonSchema` (verified in SDK 3.6.1 typings). Bounding boxes use
 * Gemini’s native box_2d format [ymin, xmin, ymax, xmax] normalised to 0-1000
 * and are converted back to pixel coordinates of the ORIGINAL image here.
 */
async function callGemini(image: Buffer, mimeType: string): Promise<{ data: unknown; model: string }> {
  const { res, model } = await generateResilient(
    "vision",
    () => ({
      contents: [
        {
          role: "user",
          parts: [{ inlineData: { mimeType, data: image.toString("base64") } }, { text: VISION_USER_PROMPT }],
        },
      ],
      config: {
        systemInstruction: VISION_SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseJsonSchema: VISION_RESPONSE_SCHEMA,
        temperature: 0,
      },
    }),
    { timeoutMs: 60_000, deadlineMs: 100_000 },
  );
  const text = res.text;
  if (!text) throw new AppError("AI_INVALID_RESPONSE", UNREADABLE, { internal: `Vision model ${model} returned no content (possibly blocked)` });
  try {
    return { data: JSON.parse(text), model };
  } catch {
    return { data: extractJsonObject(text), model };
  }
}

/**
 * Prepare the PNG sent for one tile. Applies EXIF orientation first, so tile
 * coordinates (computed from the displayed size) match the pixels being cropped.
 */
export async function prepareTileImage(image: Buffer, tile: { top: number; height: number }, width: number, single: boolean): Promise<Buffer> {
  const oriented = sharp(image).rotate();
  return single ? oriented.png().toBuffer() : oriented.extract({ left: 0, top: tile.top, width, height: tile.height }).png().toBuffer();
}

export async function extractFixtures(image: Buffer, width: number, height: number, onProgress?: (msg: string) => Promise<void>): Promise<Extraction> {
  const modelsUsed = new Set<string>();
  const tiles = planTiles(width, height);
  const placed: PlacedFixture[] = [];
  const warnings = new Set<string>();
  let isFootball = false;
  const layouts: string[] = [];

  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i]!;
    if (tiles.length > 1) await onProgress?.(`Reading section ${i + 1} of ${tiles.length}`);
    // PNG keeps text crisp; tiles are cropped from the original pixels.
    const crop = await prepareTileImage(image, tile, width, tiles.length === 1);
    const result = await callGemini(crop, "image/png");
    modelsUsed.add(result.model);
    const raw = RawVisionSchema.safeParse(result.data);
    if (!raw.success) {
      throw new AppError("AI_INVALID_RESPONSE", UNREADABLE, { internal: "Vision model output failed schema validation" });
    }
    isFootball ||= raw.data.is_football_fixture_image;
    layouts.push(raw.data.layout);
    raw.data.warnings.slice(0, 5).forEach((w) => warnings.add(w.slice(0, 200)));
    for (const f of raw.data.fixtures) {
      const box = toPixelBox(f.box_2d, tile, width);
      if (!box) continue;
      const edge = tile.height * 0.02;
      const touches =
        tiles.length > 1 &&
        ((i > 0 && box.y - tile.top < edge) || (i < tiles.length - 1 && tile.top + tile.height - (box.y + box.height) < edge));
      placed.push({ raw: f, box, tileIndex: i, touchesTileEdge: touches });
    }
  }

  const merged = tiles.length > 1 ? dedupeFixtures(placed) : placed;
  const { fixtures, warnings: w2 } = finalizeFixtures(merged, width, height);
  w2.forEach((w) => warnings.add(w));
  if (!isFootball) warnings.add("This does not look like a football fixtures screenshot.");
  const layout = layouts.includes("grid") ? "grid" : layouts.includes("list") ? "list" : "other";

  return {
    model: [...modelsUsed].join(", "),
    layout,
    isFootballImage: isFootball,
    imageWidth: width,
    imageHeight: height,
    tiles: tiles.length,
    fixtures,
    warnings: [...warnings],
  };
}
