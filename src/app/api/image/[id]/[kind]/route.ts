import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { clientIp, errorResponse } from "@/lib/http";
import { requireJob } from "@/lib/jobs/repository";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { requireSessionId } from "@/lib/security/session";
import { getStore } from "@/lib/storage";

/**
 * GET /api/image/[id]/original|output — streams a PRIVATE image after checking
 * the caller owns the analysis. Add ?download=1 to download.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/image/[id]/[kind]">) {
  try {
    const { id, kind } = await ctx.params;
    if (kind !== "original" && kind !== "output") throw new AppError("NOT_FOUND", "Unknown image.");
    const ownerId = await requireSessionId();
    checkRateLimit("read", `${ownerId}:${clientIp(req)}`);
    const job = await requireJob(ownerId, id);
    const key = kind === "original" ? job.image.key : job.output?.key;
    if (!key) throw new AppError("NOT_FOUND", "The filtered image has not been generated yet.");
    const obj = await getStore().get(key);
    if (!obj) throw new AppError("NOT_FOUND", "The image has expired.");

    const download = new URL(req.url).searchParams.get("download") === "1";
    const ext = obj.contentType === "image/png" ? "png" : obj.contentType === "image/webp" ? "webp" : "jpg";
    const headers: Record<string, string> = {
      "Content-Type": obj.contentType,
      "Content-Length": String(obj.body.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    };
    if (download) headers["Content-Disposition"] = `attachment; filename="fenafilter-${kind === "output" ? "filtered" : "original"}-${id.slice(0, 8)}.${ext}"`;
    return new NextResponse(new Uint8Array(obj.body), { headers });
  } catch (e) {
    return errorResponse(e, "image");
  }
}
