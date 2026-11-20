"use client";

import { upload } from "@vercel/blob/client";
import { ApiError, type SessionInfo } from "./api";

export const MAX_BYTES = 10 * 1024 * 1024;
export const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];

export function validateFile(file: File): string | null {
  if (!ACCEPTED.includes(file.type)) return "Please choose a PNG, JPG or WEBP image.";
  if (file.size > MAX_BYTES) return `This image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 10 MB.`;
  if (file.size === 0) return "This file is empty.";
  return null;
}

function randomName() {
  const a = new Uint8Array(10);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Upload the image.
 * - Vercel Blob mode: browser → Blob storage directly (private), via a scoped token from /api/upload.
 * - Local dev mode: multipart POST to /api/upload.
 * Returns the storage key used to start the analysis.
 */
export async function uploadImage(file: File, session: SessionInfo, onProgress?: (pct: number) => void): Promise<string> {
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  if (session.services.storage.mode === "vercel-blob") {
    const blob = await upload(`uploads/${session.ownerId}/${randomName()}.${ext}`, file, {
      access: "private",
      handleUploadUrl: "/api/upload",
      contentType: file.type,
      onUploadProgress: (e) => onProgress?.(e.percentage),
    });
    return blob.pathname;
  }
  const form = new FormData();
  form.append("file", file);
  onProgress?.(10);
  const res = await fetch("/api/upload", { method: "POST", body: form, credentials: "same-origin" });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(body?.error?.message ?? "Upload failed.", res.status);
  onProgress?.(100);
  return body.pathname as string;
}
