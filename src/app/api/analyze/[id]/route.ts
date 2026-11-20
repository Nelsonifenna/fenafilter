import { after } from "next/server";
import { clientIp, errorResponse, json } from "@/lib/http";
import { advance, needsWorker } from "@/lib/jobs/pipeline";
import { requireJob } from "@/lib/jobs/repository";
import { toJobView } from "@/lib/jobs/view";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { requireSessionId } from "@/lib/security/session";

export const maxDuration = 300;

/**
 * GET /api/analyze/[id] — job status, progress and results.
 * Polling this endpoint also resumes background work that was paused (time
 * budget, API rate limit) or interrupted (instance recycled).
 */
export async function GET(req: Request, ctx: RouteContext<"/api/analyze/[id]">) {
  try {
    const { id } = await ctx.params;
    const ownerId = await requireSessionId();
    checkRateLimit("read", `${ownerId}:${clientIp(req)}`);
    const job = await requireJob(ownerId, id);
    if (needsWorker(job)) after(() => advance(ownerId, id));
    return json(toJobView(job));
  } catch (e) {
    return errorResponse(e, "analyze-status");
  }
}
