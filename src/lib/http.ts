import "server-only";
import { unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { AppError, logError, toPublicError } from "./errors";

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, {
    ...init,
    headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) },
  });
}

export function errorResponse(err: unknown, context: string) {
  // Let Next.js handle its own control-flow signals (dynamic rendering bail-outs etc.).
  unstable_rethrow(err);
  const pub = toPublicError(err);
  if (pub.status >= 500) logError(context, err);
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (err instanceof AppError && err.code === "RATE_LIMITED" && typeof err.details === "number") {
    headers["Retry-After"] = String(err.details);
  }
  return NextResponse.json({ error: { code: pub.code, message: pub.message } }, { status: pub.status, headers });
}

/** Parse and validate a JSON body with a size cap. */
export async function readJson<S extends z.ZodType>(req: Request, schema: S, maxBytes = 256_000): Promise<z.infer<S>> {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > maxBytes) throw new AppError("PAYLOAD_TOO_LARGE", "Request body is too large.");
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    throw new AppError("BAD_REQUEST", "Could not read request body.");
  }
  if (raw.length > maxBytes) throw new AppError("PAYLOAD_TOO_LARGE", "Request body is too large.");
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new AppError("BAD_REQUEST", "Request body must be valid JSON.");
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new AppError("BAD_REQUEST", `Invalid request: ${first?.path.join(".") || "body"} ${first?.message ?? ""}`.trim());
  }
  return parsed.data;
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "local";
}
