import "server-only";
import { randomBytes } from "node:crypto";
import sharp, { type Metadata } from "sharp";
import { AppError } from "./errors";
import { MAX_PIXELS } from "./imaging/compose";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
const FORMAT_TO_TYPE: Record<string, (typeof ALLOWED_TYPES)[number]> = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" };
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export function uploadPathRegex(ownerId: string) {
  return new RegExp(`^uploads/${ownerId}/[A-Za-z0-9_-]{1,80}\\.(png|jpe?g|webp)$`);
}

export function newUploadKey(ownerId: string, contentType: string) {
  return `uploads/${ownerId}/${randomBytes(12).toString("hex")}.${EXT[contentType] ?? "bin"}`;
}

/**
 * Validate an image by decoding its header — never trust the file name or the
 * browser-provided MIME type. Returns the display (orientation-corrected) size.
 */
export async function inspectImage(buf: Buffer) {
  if (buf.length === 0) throw new AppError("BAD_REQUEST", "The file is empty.");
  if (buf.length > MAX_UPLOAD_BYTES) throw new AppError("PAYLOAD_TOO_LARGE", "Images must be 10 MB or smaller.");
  let meta: Metadata;
  try {
    meta = await sharp(buf, { limitInputPixels: MAX_PIXELS }).metadata();
  } catch {
    throw new AppError("UNSUPPORTED_MEDIA", "This file is not a valid image.");
  }
  const contentType = meta.format ? FORMAT_TO_TYPE[meta.format] : undefined;
  if (!contentType) throw new AppError("UNSUPPORTED_MEDIA", "Only PNG, JPG and WEBP images are supported.");
  if (!meta.width || !meta.height) throw new AppError("UNSUPPORTED_MEDIA", "Could not read the image dimensions.");
  if ((meta.pages ?? 1) > 1) throw new AppError("UNSUPPORTED_MEDIA", "Animated images are not supported.");
  const rotated = (meta.orientation ?? 1) >= 5;
  const width = rotated ? meta.height : meta.width;
  const height = rotated ? meta.width : meta.height;
  if (width < 200 || height < 100) throw new AppError("BAD_REQUEST", "The image is too small to read fixtures from (minimum 200×100 px).");
  if (width > 6000 || height > 20000) throw new AppError("BAD_REQUEST", "The image dimensions are too large (max 6000 px wide, 20000 px tall).");
  return { contentType, width, height, sizeBytes: buf.length };
}
