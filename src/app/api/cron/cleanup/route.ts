import { timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/config/env";
import { AppError } from "@/lib/errors";
import { errorResponse, json } from "@/lib/http";
import { getStore } from "@/lib/storage";

export const maxDuration = 300;

const MAX_AGE_MS = 26 * 3600_000;

/**
 * GET /api/cron/cleanup — deletes uploads, outputs and job records older than
 * ~1 day. Called daily by Vercel Cron (vercel.json) with
 * `Authorization: Bearer $CRON_SECRET`. Blob objects also carry ttlDays as a
 * second safety net.
 */
export async function GET(req: Request) {
  try {
    const secret = getEnv().cronSecret;
    const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
      throw new AppError("UNAUTHORIZED", "Unauthorized.");
    }
    const store = getStore();
    const cutoff = Date.now() - MAX_AGE_MS;
    let deleted = 0;
    for (const prefix of ["uploads/", "outputs/", "jobs/"]) {
      const old = (await store.list(prefix)).filter((o) => o.uploadedAt.getTime() < cutoff).map((o) => o.key);
      for (let i = 0; i < old.length; i += 100) {
        await store.delete(old.slice(i, i + 100));
      }
      deleted += old.length;
    }
    return json({ deleted });
  } catch (e) {
    return errorResponse(e, "cleanup");
  }
}
